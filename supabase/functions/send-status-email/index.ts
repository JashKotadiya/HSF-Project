import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const templates: Record<string, { subject: string; message: string }> = {
  pending: {
    subject: "We received your application",
    message: "Thanks for applying! Your application has been received.",
  },
  approved: {
    subject: "Your application was approved",
    message: "Good news, your application was approved!",
  },
  rejected: {
    subject: "An update on your application",
    message: "Thank you for applying. Unfortunately you were not selected this time.",
  },
};

export default {
  // Only callers with a secret key (like our database webhook) are allowed
  fetch: withSupabase({ auth: ["secret"] }, async (req) => {
    const { type, record, old_record } = await req.json();

    // Skip updates where the status didn't actually change
    if (type === "UPDATE" && record.status === old_record?.status) {
      return new Response("status unchanged");
    }
    // "received" is only sent for brand-new applications
    if (type === "UPDATE" && record.status === "pending") {
      return new Response("no email when reset to pending");
    }

    const template = templates[record.status];
    if (!template) return new Response("no template for this status");
    if (!record.applicant_email) {
      return new Response("application has no applicant_email", { status: 400 });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "HSF <onboarding@resend.dev>",
        to: [record.applicant_email],
        subject: template.subject,
        html: `<p>Hi ${record.applicant_name ?? "there"},</p><p>${template.message}</p>`,
      }),
    });

    return new Response(await res.text(), { status: res.status });
  }),
};