"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { FunctionsHttpError } from "@supabase/supabase-js";
import supabase from "@/lib/supabase";
import { useAuth } from "@/components/auth/AuthProvider";

const MAX_QUESTION_LENGTH = 500;
const UNAVAILABLE = "The help assistant isn't available right now. Please try again later.";

type HelpLink = { label: string; path: string };
type Outcome =
  | { kind: "answer"; supported: boolean; answer: string; links: HelpLink[] }
  | { kind: "error"; message: string };

/** Where each kind of account can go next, whether or not the assistant could answer. */
const QUICK_LINKS: Record<"volunteer" | "nonprofit", HelpLink[]> = {
  volunteer: [
    { label: "Browse Projects", path: "/projects" },
    { label: "My Projects", path: "/volunteer/projects" },
    { label: "My Profile", path: "/volunteer/profile" },
  ],
  nonprofit: [
    { label: "My Projects", path: "/nonprofit/dashboard" },
    { label: "Applicants", path: "/nonprofit/dashboard/applicants" },
    { label: "Settings", path: "/nonprofit/settings" },
  ],
};

/** Only pages inside this app are ever shown as links, whatever the server sends. */
const isInternalPath = (path: unknown): path is string =>
  typeof path === "string" && /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(path);

function LinkList({ title, links }: { title: string; links: HelpLink[] }) {
  if (links.length === 0) return null;
  return (
    <div>
      {title && <p className="mb-2 text-sm font-semibold text-[#475569]">{title}</p>}
      <ul className="flex flex-wrap gap-2">
        {links.map((link) => (
          <li key={`${link.path}-${link.label}`}>
            <Link
              href={link.path}
              className="inline-block rounded-md border border-[#A792FF] px-3 py-1.5 text-sm font-semibold text-[#4A0E99] transition hover:bg-[#EDE9FF]"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * PROTOTYPE (issue #106): an AI assistant that explains how to use HSF. It is read-only:
 * it cannot message anyone, apply, approve, or change an account, and it is sent only the
 * typed question (see supabase/functions/help-assistant).
 */
export default function HelpAssistant() {
  const { loading, user, role } = useAuth();
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // One question at a time, even if Ask is pressed twice before the page updates.
  const busy = useRef(false);

  const quickLinks = QUICK_LINKS[role ?? "volunteer"];
  const trimmed = question.trim();

  const ask = async () => {
    if (!trimmed || busy.current) return;
    busy.current = true;
    setAsking(true);
    setOutcome(null);

    const { data, error } = await supabase.functions.invoke("help-assistant", { body: { question: trimmed } });
    busy.current = false;
    setAsking(false);

    if (error) {
      let message = UNAVAILABLE;
      if (error instanceof FunctionsHttpError) {
        try {
          const body = await error.context.json();
          if (typeof body?.error === "string") message = body.error;
        } catch {
          // keep the generic message
        }
      }
      setOutcome({ kind: "error", message });
      return;
    }

    if (typeof data?.answer !== "string" || !data.answer) {
      setOutcome({ kind: "error", message: UNAVAILABLE });
      return;
    }
    const links = Array.isArray(data.links)
      ? (data.links as HelpLink[]).filter((link) => typeof link?.label === "string" && isInternalPath(link?.path))
      : [];
    setOutcome({ kind: "answer", supported: data.supported === true, answer: data.answer, links });
  };

  if (loading) {
    return <div className="h-48 animate-pulse rounded-xl bg-[#F1F5F9]" />;
  }

  if (!user) {
    return (
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-6">
        <h2 className="text-xl font-bold text-[#092130]">AI help</h2>
        <p className="mt-2 text-sm text-[#475569]">Sign in to ask the help assistant how to use Human Service Forum.</p>
        <Link href="/" className="mt-4 inline-block rounded-md bg-[#114160] px-4 py-2 text-sm font-semibold text-white hover:bg-[#092130]">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border border-[#E2E8F0] bg-white p-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-[#092130]">AI help</h2>
          <span className="rounded-full bg-[#EDE9FF] px-2.5 py-0.5 text-xs font-semibold text-[#4A0E99]">Prototype</span>
        </div>
        <p className="text-sm text-[#475569]">
          Ask how to use Human Service Forum. Answers are written by an AI from our help guide and can be wrong.
        </p>
        <p className="rounded-md bg-[#F8FAFC] p-3 text-xs text-[#64748B]">
          Your question is sent to Google&apos;s Gemini service to write the answer. Don&apos;t include personal information,
          passwords or private messages. This assistant can&apos;t send messages, apply to projects, approve applicants or
          change your account.
        </p>

        <label htmlFor="help-question" className="block text-sm font-semibold text-[#092130]">
          Your question
        </label>
        <textarea
          id="help-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={MAX_QUESTION_LENGTH}
          rows={3}
          placeholder="For example: How do I apply to a project?"
          className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2 text-sm text-[#0F172A] outline-none transition focus:border-[#114160] focus:ring-1 focus:ring-[#114160]"
        />
        <button
          type="button"
          onClick={ask}
          disabled={asking || !trimmed}
          className="rounded-md bg-[#4A0E99] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#3a0b78] disabled:opacity-60"
        >
          {asking ? "Thinking…" : "Ask"}
        </button>

        <div aria-live="polite" className="space-y-4">
          {outcome?.kind === "answer" && (
            <>
              <p className="whitespace-pre-wrap text-sm text-[#0F172A]">{outcome.answer}</p>
              <LinkList title="Related pages" links={outcome.links} />
              {(!outcome.supported || outcome.links.length === 0) && <LinkList title="Where to go next" links={quickLinks} />}
            </>
          )}
          {outcome?.kind === "error" && (
            <>
              <p className="text-sm text-red-600">{outcome.message}</p>
              <LinkList title="Where to go next" links={quickLinks} />
            </>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-[#E2E8F0] bg-white p-6">
        <h2 className="text-lg font-bold text-[#092130]">Need to reach a person?</h2>
        <p className="mt-2 text-sm text-[#475569]">
          This assistant is separate from your conversations with volunteers and organizations, and it can&apos;t see them.
          {role === "nonprofit"
            ? " To contact an applicant, open the Applicants page."
            : " To follow up on an application, open My Projects."}
        </p>
        <div className="mt-4">
          <LinkList
            title=""
            links={[role === "nonprofit" ? QUICK_LINKS.nonprofit[1] : QUICK_LINKS.volunteer[1]]}
          />
        </div>
      </section>
    </div>
  );
}
