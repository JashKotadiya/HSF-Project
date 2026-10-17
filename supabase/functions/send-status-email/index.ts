const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "HSF <onboarding@resend.dev>";
const TEST_EMAIL_OVERRIDE = Deno.env.get("TEST_EMAIL_OVERRIDE");

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
  const { type, record, old_record } = await req.json();

  let key: string | null = null;
  if (type === "INSERT") {
    key = "pending";
  } else if (type === "UPDATE") {
    if (record.status !== old_record?.status && record.status === "rejected") {
      key = "rejected";
    } else if (record.viewed_at && !old_record?.viewed_at) {
      key = "viewed";
    }
  }
  if (!key) return new Response("ignored");

  if (!record.applicant_email) {
    return new Response("application has no applicant_email", { status: 400 });
  }

  try {
    const template = templates[key];
    await sendEmail(
      record.applicant_email,
      template.subject,
      `<p>Hi ${esc(record.applicant_name ?? "there")},</p><p>${esc(template.message)}</p>`,
    );
    return new Response("sent");
  } catch (err) {
    console.error(err);
    return new Response(String(err), { status: 500 });
  }
});