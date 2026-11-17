"use client";
import { useEffect, useRef, useState } from "react";
import StatusBadge from "@/components/applications/StatusBadge";
import ConversationView from "@/components/messaging/ConversationView";
import type { InboxData } from "@/components/messaging/useConversations";
import { listMessageRecipients, RECIPIENT_PAGE_SIZE } from "@/lib/messageRecipients";
import type { MessageRecipient } from "@/lib/messageRecipients";
import type { AppRole } from "@/lib/roles";

export default function MessagingWorkspace({ userId, role, inbox, applicationId, onSelect, compact = false }: { userId: string; role: AppRole; inbox: InboxData; applicationId: string | null; onSelect: (id: string | null) => void; compact?: boolean }) {
  const [composing, setComposing] = useState(false);
  const { conversations, loading, error, reload } = inbox;
  const unread = conversations.reduce((total, conversation) => total + conversation.unread_count, 0);
  const choose = (id: string) => { setComposing(false); onSelect(id); };
  return <div className={compact ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "grid items-start gap-6 lg:grid-cols-[minmax(250px,1fr)_minmax(0,2fr)]"}>
    <aside aria-label="Conversations" className={`${applicationId && !composing ? (compact ? "hidden" : "hidden lg:block") : ""} ${compact ? "min-h-0 flex-1 overflow-y-auto" : "rounded-2xl border border-[#E2E8F0]"} min-w-0 bg-white`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] p-4"><h2 className="font-bold text-[#092130]">Inbox{unread > 0 ? ` (${unread} unread)` : ""}</h2><button type="button" onClick={() => setComposing(value => !value)} className="message-action">{composing ? "Back to inbox" : "New message"}</button></div>
      {composing ? <RecipientPicker key={userId} userId={userId} role={role} onSelect={choose} /> : <>
        <div className="flex items-center justify-between px-4 py-3"><p className="text-xs text-[#64748B]">Your project conversations</p><button type="button" onClick={reload} className="min-h-10 px-2 text-sm font-semibold text-[#114160] underline">Refresh inbox</button></div>
        {loading && <p role="status" className="p-4 text-sm">Loading conversations...</p>}
        {error && <div role="alert" className="m-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><p>{error}</p><button type="button" onClick={reload} className="mt-2 min-h-10 font-semibold underline">Retry inbox</button></div>}
        {!loading && !error && conversations.length === 0 && <div className="px-6 py-12 text-center"><h3 className="font-semibold text-[#092130]">Start a conversation</h3><p className="mt-2 text-sm leading-6 text-[#475569]">Choose New message to connect about an application. You can talk before approval.</p></div>}
        <ul className="divide-y divide-[#E2E8F0]">{conversations.map(conversation => <li key={conversation.application_id}>
          <button type="button" onClick={() => choose(conversation.application_id)} aria-current={applicationId === conversation.application_id ? "true" : undefined} className={`block w-full space-y-2 border-l-4 p-4 text-left transition hover:bg-[#F8FAFC] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#2182BF] ${applicationId === conversation.application_id ? "border-[#114160] bg-[#F0F7FB]" : "border-transparent"}`}>
            <div className="flex items-start justify-between gap-2"><span className="min-w-0 break-words font-semibold text-[#092130]">{conversation.participant_name}</span>{conversation.unread_count > 0 && <span className="shrink-0 rounded-full bg-[#114160] px-2 py-1 text-xs font-bold text-white">{conversation.unread_count} unread</span>}</div>
            <p className="break-words text-sm text-[#475569]">{conversation.project_title}</p><StatusBadge status={conversation.application_status} /><p className="line-clamp-2 text-sm text-[#64748B] [overflow-wrap:anywhere]">{conversation.last_message ?? (conversation.can_send ? "Start the conversation" : "No messages")}</p>
          </button>
        </li>)}</ul>
      </>}
    </aside>
    {applicationId && !composing ? <ConversationView key={`${userId}:${applicationId}`} userId={userId} applicationId={applicationId} onChange={reload} onBack={() => onSelect(null)} compact={compact} /> : !compact && <section className="hidden rounded-2xl border border-dashed border-[#CBD5E1] bg-white px-8 py-24 text-center text-[#475569] lg:block"><h2 className="text-xl font-semibold text-[#092130]">A conversation starts here</h2><p className="mt-3 text-sm">Choose a conversation or start a new message about an application.</p></section>}
  </div>;
}

function RecipientPicker({ userId, role, onSelect }: { userId: string; role: AppRole; onSelect: (id: string) => void }) {
  const [rows, setRows] = useState<MessageRecipient[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const busy = useRef(false);
  useEffect(() => {
    let active = true;
    busy.current = true;
    const load = async () => {
      try {
        const page = await listMessageRecipients(userId, role, offset);
        if (!active) return;
        setRows(previous => [...new Map([...previous, ...page].map(row => [row.id, row])).values()]);
        setHasMore(page.length === RECIPIENT_PAGE_SIZE); setError(null);
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : "Couldn't load applications."); }
      finally { if (active) { busy.current = false; setLoading(false); } }
    };
    void load();
    return () => { active = false; };
  }, [userId, role, offset, revision]);
  return <div className="p-4"><h3 className="font-semibold text-[#092130]">Choose an application</h3><p className="mt-1 text-sm leading-6 text-[#64748B]">Message a project organization or applicant while the application is pending or approved.</p>
    {error && <div role="alert" className="my-3 rounded-lg bg-amber-50 p-3 text-sm"><p>{error}</p><button type="button" onClick={() => { setLoading(true); setRevision(value => value + 1); }} className="message-action">Retry applications</button></div>}
    <ul className="mt-4 space-y-2">{rows.map(row => <li key={row.id}><button type="button" onClick={() => onSelect(row.id)} className="w-full space-y-2 rounded-xl border border-[#E2E8F0] p-4 text-left hover:bg-[#F0F7FB] focus-visible:outline-2 focus-visible:outline-[#2182BF]"><span className="block break-words font-semibold">{row.name}</span><span className="block break-words text-sm text-[#475569]">{row.project}</span><StatusBadge status={row.status as "pending" | "approved"} /></button></li>)}</ul>
    {loading && <p role="status" className="py-4 text-sm">Loading applications...</p>}
    {!loading && !error && rows.length === 0 && <p className="py-6 text-sm text-[#475569]">No pending or approved applications yet. Conversations become available after an application is submitted.</p>}
    {hasMore && !error && <button type="button" disabled={loading} onClick={() => { if (!busy.current) { busy.current = true; setLoading(true); setOffset(value => value + RECIPIENT_PAGE_SIZE); } }} className="message-action mt-4">More applications</button>}
  </div>;
}
