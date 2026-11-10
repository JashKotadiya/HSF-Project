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

// Private delivery address: the account's login email, looked up from the account
// record. It is used only to deliver a notification, never shown to anyone else, and
// never taken from the event or from applications.applicant_email.
async function accountEmail(userId: string) {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) throw error;
  return data?.user?.email;
}

// Optional contact address: only what the account holder chose to share. A blank
// address, or one they have not turned sharing on for, counts as none.
async function sharedContact(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("contact_email, share_contact_email")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  const email = data?.contact_email?.trim();
  return data?.share_contact_email === true && email ? email : null;
}

// What an email says about the other person's contact: their shared address, or that there is none.
const contactLine = (who: string, contact: string | null) =>
  contact
    ? `<p>Contact email: <a href="mailto:${esc(contact)}">${esc(contact)}</a></p>`
    : `<p>${who} hasn't shared a contact email.</p>`;

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
    // where each notification is delivered (private)
    nonprofitEmail,
    volunteerEmail,
    // what each person has chosen to share with the other (usually nothing)
    nonprofitContact: await sharedContact(post.user_id),
    volunteerContact: await sharedContact(app.volunteer_id),
    project: esc(post.title || "your project"),
    orgName: esc(post.organization_name || post.poster_name || "the organization"),
    volName: esc(app.applicant_name || "the volunteer"),
  };
}

type Delivery =
  | "new_application_organization"
  | "new_application_volunteer"
  | "match_volunteer"
  | "match_organization";

// A claim that was never completed (the function crashed or timed out mid-send) can be
// taken over after this long, so a notification is not lost for good.
const CLAIM_LEASE_MS = 5 * 60 * 1000;

// Claims one email for one application. Returns true only if this request may send it:
// no row exists yet (the new row is the claim), or an earlier claim was never completed
// and has gone stale. A database error is thrown, never read as "already sent".
async function claimDelivery(applicationId: string, kind: Delivery) {
  const now = new Date();
  const { data: inserted, error } = await supabase
    .from("email_deliveries")
    .upsert(
      { application_id: applicationId, kind, claimed_at: now.toISOString() },
      { onConflict: "application_id,kind", ignoreDuplicates: true },
    )
    .select("kind");
  if (error) throw error;
  if (inserted?.length) return true;

  const staleBefore = new Date(now.getTime() - CLAIM_LEASE_MS).toISOString();
  const { data: takenOver, error: takeoverError } = await supabase
    .from("email_deliveries")
    .update({ claimed_at: now.toISOString() })
    .eq("application_id", applicationId)
    .eq("kind", kind)
    .is("sent_at", null)
    .lt("claimed_at", staleBefore)
    .select("kind");
  if (takeoverError) throw takeoverError;
  return Boolean(takenOver?.length);
}

// Gives up a claim after a failed send so a retry can send it. If this fails too, the
// claim simply expires and can be taken over (see CLAIM_LEASE_MS).
async function releaseDelivery(applicationId: string, kind: Delivery) {
  const { error } = await supabase
    .from("email_deliveries")
    .delete()
    .eq("application_id", applicationId)
    .eq("kind", kind)
    .is("sent_at", null);
  if (error) console.error(`Could not release the ${kind} claim; it can be retried once the claim expires`, error);
}

// Marks a sent email as sent. Tried twice, because the email is already out by now.
async function recordSent(applicationId: string, kind: Delivery) {
  for (let attempt = 1; ; attempt++) {
    const { error } = await supabase
      .from("email_deliveries")
      .update({ sent_at: new Date().toISOString() })
      .eq("application_id", applicationId)
      .eq("kind", kind);
    if (!error) return;
    if (attempt === 2) throw error;
  }
}

// Sends one email at most once. `send` returns true if it sent something, or false if
// there turned out to be nothing to send. `stillValid` is checked after the claim, just
// before sending.
async function deliverOnce(
  applicationId: string,
  kind: Delivery,
  send: () => Promise<boolean>,
  stillValid: () => Promise<boolean> = async () => true,
) {
  if (!(await claimDelivery(applicationId, kind))) return false;

  let delivered: boolean;
  try {
    delivered = (await stillValid()) && (await send());
  } catch (err) {
    await releaseDelivery(applicationId, kind);
    throw err;
  }
  if (!delivered) {
    await releaseDelivery(applicationId, kind);
    return false;
  }
  // The email is out: from here the claim is never released, so it cannot be sent twice.
  await recordSent(applicationId, kind);
  return true;
}

type Step = { kind: Delivery; send: () => Promise<boolean> };

// Runs each email on its own: one failing does not stop the others, and one that was
// already delivered is skipped. After every email has been tried, the first failure (if
// any) is thrown so the caller sees that something still needs a retry.
async function runDeliveries(
  applicationId: string,
  steps: Step[],
  stillValid?: () => Promise<boolean>,
) {
  let sent = 0;
  const failures: unknown[] = [];
  for (const step of steps) {
    try {
      if (await deliverOnce(applicationId, step.kind, step.send, stillValid)) sent++;
    } catch (err) {
      console.error(`${step.kind} was not delivered`, err);
      failures.push(err);
    }
  }
  if (failures.length) throw failures[0];
  return sent;
}

// Loads something once, only when first needed. A failed load is not remembered.
function lazy<T>(load: () => Promise<T>) {
  let value: T | undefined;
  return async () => (value ??= await load());
}

// A volunteer applied: tell the organization. The volunteer's address is included only
// if they chose to share one. If the organization shared a contact address, the
// volunteer is told it too, so sharing works in both directions while pending.
async function notifyNewApplicant(app: Application) {
  const context = lazy(() => loadContext(app));
  const sent = await runDeliveries(app.id, [
    {
      kind: "new_application_organization",
      send: async () => {
        const c = await context();
        const link = `${SITE_URL}/nonprofit/dashboard/applicants?project=${c.post.id}`;
        await sendEmail(
          c.nonprofitEmail,
          `New applicant for ${c.post.title}`,
          `<p><b>${c.volName}</b> applied to <b>${c.project}</b>.</p>
           ${contactLine("The volunteer", c.volunteerContact)}
           <p><a href="${esc(link)}">Review the application</a></p>`,
          c.volunteerContact ?? undefined,
        );
        return true;
      },
    },
    {
      kind: "new_application_volunteer",
      send: async () => {
        const c = await context();
        if (!c.nonprofitContact) return false; // nothing shared, so nothing to send
        await sendEmail(
          c.volunteerEmail,
          `Contact for your application to ${c.post.title}`,
          `<p>${c.orgName} shared a contact email for your application to <b>${c.project}</b>.</p>
           ${contactLine("The organization", c.nonprofitContact)}`,
          c.nonprofitContact,
        );
        return true;
      },
    },
  ]);
  return reply(sent > 0 ? "notified" : "already notified");
}

// An application was approved: tell both people, once each, and pass along whichever
// contact address each has chosen to share. Each email is tracked separately, so a
// retry sends only the one that is still missing. Before sending, the stored status is
// checked again, so an event cannot make us announce an approval that is not (or no
// longer) real.
async function sendMatch(app: Application) {
  const context = lazy(() => loadContext(app));
  const stillApproved = async () => (await loadApplication(app.id))?.status === "approved";
  const sent = await runDeliveries(
    app.id,
    [
      {
        kind: "match_volunteer",
        send: async () => {
          const c = await context();
          await sendEmail(
            c.volunteerEmail,
            `You're matched: ${c.post.title}`,
            `<p>Great news! ${c.orgName} approved your application for <b>${c.project}</b>.</p>
             ${contactLine("The organization", c.nonprofitContact)}`,
            c.nonprofitContact ?? undefined,
          );
          return true;
        },
      },
      {
        kind: "match_organization",
        send: async () => {
          const c = await context();
          await sendEmail(
            c.nonprofitEmail,
            `Match confirmed: ${c.post.title}`,
            `<p>You approved ${c.volName} for <b>${c.project}</b>.</p>
             ${contactLine("The volunteer", c.volunteerContact)}`,
            c.volunteerContact ?? undefined,
          );
          return true;
        },
      },
    ],
    stillApproved,
  );
  return reply(sent > 0 ? "sent" : "already sent");
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