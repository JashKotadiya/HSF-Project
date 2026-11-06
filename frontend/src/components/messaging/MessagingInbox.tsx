"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import StatusBadge from "@/components/applications/StatusBadge";
import ConversationView from "@/components/messaging/ConversationView";
import { MESSAGE_POLL_MS, messageLink, messagingAPI } from "@/lib/messaging";
import type { Conversation } from "@/lib/messaging";

export default function MessagingInbox() {
  const { user, loading } = useAuth();
  const applicationId = useSearchParams().get("application");
  if (loading) return <p role="status" className="p-6">Loading your account...</p>;
  if (!user) return <main className="mx-auto max-w-xl p-6"><h1 className="text-2xl font-bold">Messages</h1><p className="my-4">Sign in to see your conversations.</p><Link href="/" className="text-[#114160] underline">Log in</Link></main>;
  return <Inbox key={user.id} userId={user.id} applicationId={applicationId} />;
}

function Inbox({ userId, applicationId }: { userId: string; applicationId: string | null }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const requestVersion = useRef(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      const version = ++requestVersion.current;
      try {
        const result = await messagingAPI.list();
        if (!active || version !== requestVersion.current) return;
        setConversations(result);
        setError(null);
      } catch (failure) {
        if (!active || version !== requestVersion.current) return;
        setError(failure instanceof Error ? failure.message : "Couldn't load conversations. Please try again.");
      } finally {
        inFlight = false;
        if (active && version === requestVersion.current) setLoading(false);
      }
    };
    const refreshVisible = () => { if (document.visibilityState === "visible") void load(); };
    void load();
    const timer = window.setInterval(refreshVisible, MESSAGE_POLL_MS);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [revision]);

  const unread = conversations.reduce((total, conversation) => total + conversation.unread_count, 0);
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-[#092130]">Messages</h1>
        <p className="mt-2 text-sm text-[#475569]">Talk about an application before or after approval.</p>
      </header>
      <div className="grid items-start gap-6 md:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)]">
        <aside aria-label="Conversations" className={`${applicationId ? "hidden md:block" : ""} min-w-0 rounded-xl border border-[#E2E8F0] bg-white`}>
          <div className="flex items-center justify-between gap-2 border-b border-[#E2E8F0] p-4">
            <h2 className="font-bold">Inbox{unread > 0 ? ` (${unread} unread)` : ""}</h2>
            <button type="button" onClick={reload} className="text-sm font-semibold text-[#114160] underline">Refresh</button>
          </div>
          {loading && <p role="status" className="p-4 text-sm">Loading conversations...</p>}
          {error && <div role="alert" className="m-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900"><p>{error}</p><button type="button" onClick={reload} className="mt-2 font-semibold underline">Retry inbox</button></div>}
          {!loading && !error && conversations.length === 0 && <p className="p-6 text-sm text-[#475569]">No conversations yet. Open an application and choose its message link to start a conversation.</p>}
          <ul className="divide-y divide-[#E2E8F0]">
            {conversations.map(conversation => (
              <li key={conversation.id}>
                <Link href={messageLink(conversation.application_id)} aria-current={applicationId === conversation.application_id ? "page" : undefined}
                  className={`block space-y-2 p-4 transition hover:bg-[#F8FAFC] ${applicationId === conversation.application_id ? "border-l-4 border-[#114160] bg-[#F0F7FB]" : "border-l-4 border-transparent"}`}>
                  <div className="flex items-start justify-between gap-2"><span className="break-words font-semibold text-[#092130]">{conversation.participant_name}</span>{conversation.unread_count > 0 && <span className="shrink-0 rounded-full bg-[#114160] px-2 py-1 text-xs font-bold text-white">{conversation.unread_count} unread</span>}</div>
                  <p className="break-words text-sm text-[#475569]">{conversation.project_title}</p>
                  <StatusBadge status={conversation.application_status} />
                  <p className="line-clamp-2 break-words text-sm text-[#64748B]">{conversation.last_message ?? (conversation.can_send ? "Start the conversation" : "No messages")}</p>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
        {applicationId ? <ConversationView key={`${userId}:${applicationId}`} userId={userId} applicationId={applicationId} onChange={reload} /> :
          <section className="hidden rounded-xl border border-dashed border-[#CBD5E1] p-12 text-center text-[#475569] md:block"><h2 className="font-semibold text-[#092130]">Choose a conversation</h2><p className="mt-2 text-sm">Your message history and replies will appear here.</p></section>}
      </div>
    </main>
  );
}
