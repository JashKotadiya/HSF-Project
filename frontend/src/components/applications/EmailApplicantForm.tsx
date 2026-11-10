"use client";

import { useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import supabase from "@/lib/supabase";

export default function EmailApplicantForm({ applicationId }: { applicationId: string }) {
  const [open, setOpen] = useState(false);
  // Subject and message are kept together so a send can tell whether the draft changed.
  const [draft, setDraft] = useState({ subject: "", message: "" });
  const { subject, message } = draft;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [replyEnabled, setReplyEnabled] = useState(true);

  const send = async () => {
    // The text this request carries. Anything typed after this point is a newer draft.
    const submitted = { subject, message };
    setSending(true);
    setError(null);
    setSent(false);
    const { data, error: invokeError } = await supabase.functions.invoke("send-custom-email", {
      body: { application_id: applicationId, subject: submitted.subject, message: submitted.message },
    });
    setSending(false);

    if (invokeError) {
      let msg = "Couldn't send the email. Please try again.";
      if (invokeError instanceof FunctionsHttpError) {
        try {
          const body = await invokeError.context.json();
          if (body?.error) msg = body.error;
        } catch {
          // keep the generic message
        }
      }
      setError(msg);
      return;
    }
    setSent(true);
    setReplyEnabled(data?.reply_enabled !== false);
    // Clear the draft only if it is still exactly what was sent. If it was edited while
    // the request was pending, keep it: those edits were never part of the sent message.
    setDraft((current) =>
      current.subject === submitted.subject && current.message === submitted.message
        ? { subject: "", message: "" }
        : current,
    );
  };

  if (!open) {
    return (
      <div className="border-t border-[#E2E8F0] pt-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-[#A792FF] px-5 py-2.5 text-sm font-semibold text-[#4A0E99] transition hover:bg-[#EDE9FF]"
        >
          Email applicant
        </button>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-1 focus:ring-[#114160]";

  return (
    <div className="space-y-3 border-t border-[#E2E8F0] pt-6">
      <h3 className="text-lg font-bold text-[#092130]">Email applicant</h3>
      <input
        type="text"
        value={subject}
        onChange={(e) => {
          const value = e.target.value;
          setDraft((current) => ({ ...current, subject: value }));
        }}
        maxLength={150}
        placeholder="Subject"
        className={inputClass}
      />
      <textarea
        value={message}
        onChange={(e) => {
          const value = e.target.value;
          setDraft((current) => ({ ...current, message: value }));
        }}
        maxLength={3000}
        rows={5}
        placeholder="Write your message. If you share a contact email, replies go to it."
        className={inputClass}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {sent && <p className="text-sm text-emerald-700">Email sent.</p>}
            {sent && !replyEnabled && (
        <p className="text-sm text-[#64748B]">
          The applicant can&apos;t reply by email, because you haven&apos;t shared a contact email. You can add one under
          Contact sharing.
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={send}
          disabled={sending || !subject.trim() || !message.trim()}
          className="rounded-md bg-[#4A0E99] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#3a0b78] disabled:opacity-60"
        >
          {sending ? "Sending…" : "Send"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-5 py-2.5 text-sm font-semibold text-[#475569] hover:bg-[#F1F5F9]"
        >
          Close
        </button>
      </div>
    </div>
  );
}