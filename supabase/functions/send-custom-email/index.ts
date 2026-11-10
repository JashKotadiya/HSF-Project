import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "HSF <onboarding@resend.dev>";
const TEST_EMAIL_OVERRIDE = Deno.env.get("TEST_EMAIL_OVERRIDE");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

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

// Private delivery address: the applicant's account email, looked up from the account
// record. It is never taken from the application, and never shown to the sender.
async function accountEmail(userId: string) {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  // A deleted account simply has no address; anything else is a real failure.
  if (error?.status === 404) return undefined;
  if (error) throw error;
  return data?.user?.email;
}

// The sender's optional contact address: only what they chose to share. Without one,
// the message carries no way to reply, and their login email is never revealed.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // Who is calling? The browser sends the signed-in user's token automatically.
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!jwt) return json({ error: "Please sign in again." }, 401);
    const { data: auth } = await supabase.auth.getUser(jwt);
    const sender = auth?.user;
    if (!sender?.email) return json({ error: "Please sign in again." }, 401);

    const { application_id, subject, message } = await req.json();
    const cleanSubject = String(subject ?? "").trim();
    const cleanMessage = String(message ?? "").trim();
    if (!application_id || !cleanSubject || !cleanMessage) {
      return json({ error: "Please add a subject and a message." }, 400);
    }
    if (cleanSubject.length > 150 || cleanMessage.length > 3000) {
      return json({ error: "That message is too long." }, 400);
    }

    const { data: app } = await supabase
      .from("applications")
      .select("id, project_id, volunteer_id")
      .eq("id", application_id)
      .maybeSingle();
    if (!app) return json({ error: "Application not found." }, 404);

    const { data: post } = await supabase
      .from("posts")
      .select("title, user_id, organization_name")
      .eq("id", app.project_id)
      .maybeSingle();
    // Only the owner of the project may email its applicants.
    if (!post || post.user_id !== sender.id) {
      return json({ error: "You can only email applicants to your own projects." }, 403);
    }

    const to = await accountEmail(app.volunteer_id);
    if (!to) return json({ error: "This applicant has no email address." }, 400);

    const replyTo = await sharedContact(sender.id);
    const html = `<p>${esc(cleanMessage).replace(/\n/g, "<br>")}</p>
      <hr>
      <p style="color:#64748B;font-size:12px">
        Sent by ${esc(post.organization_name || "a nonprofit")} about your application to
        <b>${esc(post.title || "a project")}</b> on Human Service Forum.${
          replyTo ? ` Reply to this email to respond to ${esc(replyTo)}.` : ""
        }
      </p>`;

    await sendEmail(to, cleanSubject, html, replyTo ?? undefined);
    // reply_enabled tells the sender whether the applicant can answer by email.
    return json({ ok: true, reply_enabled: replyTo !== null });
  } catch (err) {
    console.error(err);
    return json({ error: "Couldn't send the email. Please try again." }, 500);
  }
});