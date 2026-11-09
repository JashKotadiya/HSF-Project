import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "HSF <onboarding@resend.dev>";
const TEST_EMAIL_OVERRIDE = Deno.env.get("TEST_EMAIL_OVERRIDE");
const SITE_URL = Deno.env.get("SITE_URL") ?? "http://localhost:3000";
// Shared with the database webhook, which sends it in the x-webhook-secret header.
// The Edge Function gateway only checks that a caller holds *a* valid token, so
// this is what proves a request came from our webhook.
const WEBHOOK_SECRET = Deno.env.get("MATCH_WEBHOOK_SECRET");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const reply = (message: string, status = 200) => new Response(message, { status });

// Compares without stopping at the first different character.
function safeEqual(a: string, b: string) {
  const encoder = new TextEncoder();
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function sendEmail(to: string, subject: string, html: string, replyTo?: string) {
  const recipient = TEST_EMAIL_OVERRIDE ?? to;
  const body = TEST_EMAIL_OVERRIDE
    ? `<p><i>[Test mode: intended for ${esc(to)}]</i></p>${html}`
    : html;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: recipient,
      subject,
      html: body,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

// Addresses come from the account record, never from the event or from
// applications.applicant_email, which the applicant types in.
async function accountEmail(userId: string) {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) throw error;
  return data?.user?.email;
}

type Application = {
  id: string;
  project_id: string;
  volunteer_id: string;
  status: string;
  applicant_name: string | null;
};

// Everything below is read from the database; the event only supplies the id.
async function loadApplication(id: string): Promise<Application | null> {
  const { data, error } = await supabase
    .from("applications")
    .select("id, project_id, volunteer_id, status, applicant_name")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadContext(app: Application) {
  const { data: post, error } = await supabase
    .from("posts")
    .select("id, title, user_id, organization_name, poster_name")
    .eq("id", app.project_id)
    .maybeSingle();
  if (error) throw error;
  if (!post) throw new Error("post not found");

  const nonprofitEmail = await accountEmail(post.user_id);
  const volunteerEmail = await accountEmail(app.volunteer_id);
  if (!nonprofitEmail || !volunteerEmail) throw new Error("missing email address");

  return {
    post,
    nonprofitEmail,
    volunteerEmail,
    project: esc(post.title || "your project"),
    orgName: esc(post.organization_name || post.poster_name || "the organization"),
    volName: esc(app.applicant_name || "the volunteer"),
  };
}

// A volunteer applied: tell the poster who it is and how to reach them, once.
async function notifyNewApplicant(app: Application) {
  const { data: claimed, error } = await supabase
    .from("applications")
    .update({ poster_notified_at: new Date().toISOString() })
    .eq("id", app.id)
    .is("poster_notified_at", null)
    .select("id");
  if (error) throw error;
  if (!claimed?.length) return reply("already notified");

  try {
    const c = await loadContext(app);
    const link = `${SITE_URL}/nonprofit/dashboard/applicants?project=${c.post.id}`;
    await sendEmail(
      c.nonprofitEmail,
      `New applicant for ${c.post.title}`,
      `<p><b>${c.volName}</b> applied to <b>${c.project}</b>.</p>
       <p>Contact: <a href="mailto:${esc(c.volunteerEmail)}">${esc(c.volunteerEmail)}</a></p>
       <p><a href="${esc(link)}">Review the application</a></p>`,
      c.volunteerEmail,
    );
    return reply("notified");
  } catch (err) {
    // Release the claim so a retry can try again.
    await supabase.from("applications").update({ poster_notified_at: null }).eq("id", app.id);
    throw err;
  }
}

// An application was approved: share contact details both ways, once. The claim
// only succeeds if the stored status is "approved", so an event cannot make us
// announce an approval that never happened.
async function sendMatch(app: Application) {
  const { data: claimed, error } = await supabase
    .from("applications")
    .update({ match_emailed_at: new Date().toISOString() })
    .eq("id", app.id)
    .eq("status", "approved")
    .is("match_emailed_at", null)
    .select("id");
  if (error) throw error;
  if (!claimed?.length) return reply("already sent");

  try {
    const c = await loadContext(app);
    await sendEmail(
      c.volunteerEmail,
      `You're matched: ${c.post.title}`,
      `<p>Great news! ${c.orgName} approved your application for <b>${c.project}</b>.</p>
       <p>You can reach them at <a href="mailto:${esc(c.nonprofitEmail)}">${esc(c.nonprofitEmail)}</a>.</p>`,
      c.nonprofitEmail,
    );
    await sendEmail(
      c.nonprofitEmail,
      `Match confirmed: ${c.post.title}`,
      `<p>You approved ${c.volName} for <b>${c.project}</b>.</p>
       <p>You can reach them at <a href="mailto:${esc(c.volunteerEmail)}">${esc(c.volunteerEmail)}</a>.</p>`,
      c.volunteerEmail,
    );
    return reply("sent");
  } catch (err) {
    // Release the claim so a retry or re-approval can try again.
    await supabase.from("applications").update({ match_emailed_at: null }).eq("id", app.id);
    throw err;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply("method not allowed", 405);

  // Fail closed: with no secret configured nobody can be verified.
  if (!WEBHOOK_SECRET) {
    console.error("MATCH_WEBHOOK_SECRET is not set");
    return reply("not configured", 503);
  }
  if (!safeEqual(req.headers.get("x-webhook-secret") ?? "", WEBHOOK_SECRET)) {
    return reply("unauthorized", 401);
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return reply("invalid request", 400);
  }

  const id = payload?.record?.id;
  if (
    payload?.schema !== "public" ||
    payload?.table !== "applications" ||
    (payload?.type !== "INSERT" && payload?.type !== "UPDATE") ||
    typeof id !== "string" ||
    !UUID.test(id)
  ) {
    return reply("invalid request", 400);
  }


    // Only a change *to* approved starts a delivery. Updates to an application that
  // was already approved include this function's own bookkeeping (recording or
  // releasing a delivery), which the webhook reports back as new events. Acting on
  // those would turn one failed send into an endless loop of retries. The previous
  // status is only used to skip work: what is sent still depends on the stored row.
  if (payload.type === "UPDATE" && payload.old_record?.status === "approved") {
    return reply("ignored");
  }

  try {
    const app = await loadApplication(id);
    if (!app) return reply("application not found", 404);

    if (payload.type === "INSERT") return await notifyNewApplicant(app);
    if (app.status === "approved") return await sendMatch(app);
    return reply("ignored");
  } catch (err) {
    console.error(err);
    return reply("error", 500);
  }
});