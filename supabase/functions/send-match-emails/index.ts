import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "HSF <onboarding@resend.dev>";
const TEST_EMAIL_OVERRIDE = Deno.env.get("TEST_EMAIL_OVERRIDE");
const SITE_URL = Deno.env.get("SITE_URL") ?? "http://localhost:3000";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

async function userEmail(id: string, fallback?: string | null) {
  if (fallback) return fallback;
  const { data } = await supabase.auth.admin.getUserById(id);
  return data?.user?.email;
}

async function loadContext(app: Record<string, string>) {
  const { data: post } = await supabase
    .from("posts")
    .select("id, title, user_id, organization_name, poster_name")
    .eq("id", app.project_id)
    .single();
  if (!post) throw new Error("post not found");

  const nonprofitEmail = await userEmail(post.user_id);
  const volunteerEmail = await userEmail(app.volunteer_id, app.applicant_email);
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

// A volunteer applied: tell the poster who it is and how to reach them.
async function notifyNewApplicant(app: Record<string, string>) {
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
  return new Response("notified");
}

// An application was approved: share contact details both ways, once.
async function sendMatch(app: Record<string, string>) {
  const { data: claimed } = await supabase
    .from("applications")
    .update({ match_emailed_at: new Date().toISOString() })
    .eq("id", app.id)
    .is("match_emailed_at", null)
    .select("id");
  if (!claimed?.length) return new Response("already sent");

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
    return new Response("sent");
  } catch (err) {
    // Release the claim so a retry or re-approval can try again.
    await supabase.from("applications").update({ match_emailed_at: null }).eq("id", app.id);
    throw err;
  }
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const app = payload.record;
    const old = payload.old_record;

    if (payload.type === "INSERT") return await notifyNewApplicant(app);
    if (payload.type === "UPDATE" && app?.status === "approved" && old?.status !== "approved") {
      return await sendMatch(app);
    }
    return new Response("ignored");
  } catch (err) {
    console.error(err);
    return new Response(String(err), { status: 500 });
  }
});