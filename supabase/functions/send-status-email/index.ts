import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "HSF <onboarding@resend.dev>";
const TEST_EMAIL_OVERRIDE = Deno.env.get("TEST_EMAIL_OVERRIDE");
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function safeEqual(a: string, b: string) {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
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
  // 1) Only our database webhook may call this: it must send the shared secret.
  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!WEBHOOK_SECRET || !safeEqual(provided, WEBHOOK_SECRET)) {
    return new Response("unauthorized", { status: 401 });
  }
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // 2) Validate the payload shape.
  let payload;
  try {
    payload = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const { type, record, old_record } = payload ?? {};
  if ((type !== "INSERT" && type !== "UPDATE") || record?.id == null) {
    return new Response("bad request", { status: 400 });
  }

  // 3) Load the application from the database. The recipient and status
  //    come from the stored row, not from the request.
  const { data: app, error: appError } = await supabase
    .from("applications")
    .select("id, status, applicant_email, applicant_name, viewed_at")
    .eq("id", record.id)
    .maybeSingle();
  if (appError) {
    console.error(appError);
    return new Response("lookup failed", { status: 500 });
  }
  if (!app) return new Response("application not found", { status: 404 });

  let key: string | null = null;
  if (type === "INSERT") {
    key = "pending";
  } else if (app.status === "rejected" && old_record?.status !== "rejected") {
    key = "rejected";
  } else if (app.viewed_at && !old_record?.viewed_at) {
    key = "viewed";
  }
  if (!key) return new Response("ignored");

  if (!app.applicant_email) {
    return new Response("application has no applicant_email", { status: 400 });
  }

  try {
    const template = templates[key];
    await sendEmail(
      app.applicant_email,
      template.subject,
      `<p>Hi ${esc(app.applicant_name ?? "there")},</p><p>${esc(template.message)}</p>`,
    );
    return new Response("sent");
  } catch (err) {
    console.error(err);
    return new Response(String(err), { status: 500 });
  }
});