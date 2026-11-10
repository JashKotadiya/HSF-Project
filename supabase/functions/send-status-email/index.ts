import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "HSF <onboarding@resend.dev>";
const TEST_EMAIL_OVERRIDE = Deno.env.get("TEST_EMAIL_OVERRIDE");
const WEBHOOK_SECRET = Deno.env.get("STATUS_WEBHOOK_SECRET") ?? Deno.env.get("MATCH_WEBHOOK_SECRET");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const reply = (message: string, status = 200) => new Response(message, { status });

function safeEqual(a: string, b: string) {
  const encoder = new TextEncoder();
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function sendEmail(to: string, subject: string, html: string) {
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
    body: JSON.stringify({ from: FROM_EMAIL, to: recipient, subject, html: body }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

async function accountEmail(userId: string) {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) throw error;
  return data?.user?.email;
}

// "approved" is handled by the send-match-emails function, so it's not here.
const templates: Record<string, { subject: string; message: string }> = {
  pending: {
    subject: "We received your application",
    message: "Thanks for applying! Your application has been received.",
  },
  viewed: {
    subject: "Your application was viewed",
    message: "An organization has viewed your application.",
  },
  rejected: {
    subject: "An update on your application",
    message: "Thank you for applying. Unfortunately you were not selected this time.",
  },
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply("method not allowed", 405);

  if (!WEBHOOK_SECRET) {
    console.error("STATUS_WEBHOOK_SECRET is not set");
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

  let key: string | null = null;
  if (payload.type === "INSERT") {
    key = "pending";
  } else if (payload.type === "UPDATE") {
    if (payload.record?.status !== payload.old_record?.status && payload.record?.status === "rejected") {
      key = "rejected";
    } else if (payload.record?.viewed_at && !payload.old_record?.viewed_at) {
      key = "viewed";
    }
  }
  if (!key) return reply("ignored");

  try {
    const { data: app, error } = await supabase
      .from("applications")
      .select("id, volunteer_id, applicant_name, status")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!app) return reply("application not found", 404);

    const volunteerEmail = await accountEmail(app.volunteer_id);
    if (!volunteerEmail) return reply("missing email address", 400);

    const template = templates[key];
    await sendEmail(
      volunteerEmail,
      template.subject,
      `<p>Hi ${esc(app.applicant_name ?? "there")},</p><p>${esc(template.message)}</p>`,
    );
    return reply("sent");
  } catch (err) {
    console.error(err);
    return reply("error", 500);
  }
});
