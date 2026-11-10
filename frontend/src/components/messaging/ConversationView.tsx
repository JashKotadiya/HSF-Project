"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import StatusBadge from "@/components/applications/StatusBadge";
import { ConversationStore } from "@/lib/conversationStore";
import { MESSAGE_LIMIT, MESSAGE_POLL_MS, messagingAPI } from "@/lib/messaging";

const buttonClass = "rounded-md border border-[#CBD5E1] px-3 py-2 text-sm font-semibold text-[#114160] hover:bg-[#F1F5F9] disabled:cursor-not-allowed disabled:opacity-50";
// Access storage lazily so server rendering and browsers that block storage work.
const drafts = {
  getItem: (key: string) => window.sessionStorage.getItem(key),
  setItem: (key: string, value: string) => window.sessionStorage.setItem(key, value),
  removeItem: (key: string) => window.sessionStorage.removeItem(key),
};

export default function ConversationView({ userId, applicationId, onChange }: { userId: string; applicationId: string; onChange: () => void }) {
  const [store] = useState(() => new ConversationStore(userId, applicationId, messagingAPI, drafts, () => crypto.randomUUID(), onChange, () => document.visibilityState === "visible"));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const history = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const olderAnchor = useRef<{ height: number; top: number } | null>(null);
  const sending = state.outgoing.some(item => item.state === "sending");

  useEffect(() => {
    void store.start();
    const refresh = () => { if (document.visibilityState === "visible") void store.refresh(); };
    const timer = window.setInterval(refresh, MESSAGE_POLL_MS);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      store.stop();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [store]);

  useLayoutEffect(() => {
    const element = history.current;
    if (!element) return;
    if (olderAnchor.current) {
      if (!state.loadingOlder) {
        element.scrollTop = olderAnchor.current.top + element.scrollHeight - olderAnchor.current.height;
        olderAnchor.current = null;
      }
    } else if (nearBottom.current) element.scrollTop = element.scrollHeight;
  }, [state.messages, state.outgoing, state.loadingOlder, state.status]);

  const loadOlder = () => {
    if (history.current) olderAnchor.current = { height: history.current.scrollHeight, top: history.current.scrollTop };
    void store.loadOlder();
  };

  return (
    <section aria-label="Conversation" className="min-w-0 rounded-xl border border-[#E2E8F0] bg-white">
      <div className="border-b border-[#E2E8F0] p-4 sm:p-6">
        <Link href="/messages" className="text-sm font-semibold text-[#114160] underline md:hidden">Back to conversations</Link>
        {state.conversation && <><h2 className="mt-2 break-words text-xl font-bold text-[#092130]">{state.conversation.participant_name}</h2><p className="my-2 break-words text-sm text-[#475569]">{state.conversation.project_title}</p><StatusBadge status={state.conversation.application_status} /></>}
      </div>
      {state.status === "loading" && <p role="status" className="p-6">Loading conversation...</p>}
      {state.error && <div role="alert" className="m-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900"><p>{state.error}</p><button type="button" disabled={state.refreshing} onClick={() => void (state.status === "error" ? store.start() : store.refresh())} className="mt-2 font-semibold underline disabled:opacity-50">Retry conversation</button></div>}
      {state.status === "ready" && <>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <button type="button" disabled={state.refreshing} onClick={() => void store.refresh()} className={buttonClass}>{state.refreshing ? "Refreshing..." : "Refresh messages"}</button>
          <button type="button" onClick={() => { if (history.current) { history.current.scrollTop = history.current.scrollHeight; nearBottom.current = true; } }} className="text-sm font-semibold text-[#114160] underline">Jump to latest</button>
        </div>
        <p role="status" className="sr-only">{state.messages.length} messages loaded. {state.outgoing.filter(item => item.state === "failed").length} failed sends.</p>
        <div ref={history} tabIndex={0} role="region" aria-label="Message history" onScroll={event => { const node = event.currentTarget; nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80; }} className="h-[45dvh] min-h-48 overflow-y-auto overscroll-contain px-4 py-2 sm:px-6">
          {state.hasOlder && <div className="mb-4 text-center"><button type="button" onClick={loadOlder} disabled={state.loadingOlder} className={buttonClass}>{state.loadingOlder ? "Loading older messages..." : "Load older messages"}</button></div>}
          {state.messages.length === 0 && state.outgoing.length === 0 && <p className="py-8 text-center text-sm text-[#475569]">{state.conversation?.can_send ? "No messages yet. Send a message about this application." : "No messages in this conversation."}</p>}
          <ol className="space-y-4">
            {state.messages.map(message => <li key={message.id} className={`max-w-[95%] rounded-xl p-3 sm:max-w-[85%] ${message.sender_id === userId ? "ml-auto bg-[#EAF3F9]" : "mr-auto bg-[#F1F5F9]"}`}>
              <p className="mb-1 text-xs font-semibold text-[#475569]">{message.sender_id === userId ? "You" : state.conversation?.participant_name}</p>
              <p className="whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">{message.body}</p>
              <p className="mt-2 text-xs text-[#475569]"><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time>{message.sender_id === userId ? " · Sent" : ""}</p>
            </li>)}
          </ol>
          <ul className="mt-4 space-y-4" aria-label="Outgoing messages">
            {state.outgoing.map(item => <li key={item.clientId} className="ml-auto max-w-[95%] rounded-xl border border-[#CBD5E1] p-3 sm:max-w-[85%]">
              <p className="whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">{item.body}</p>
              <p role="status" className="mt-2 text-xs text-[#475569]">{item.state === "sending" ? "Sending..." : "Send failed. Your text is kept here for retry."}</p>
              {item.state === "failed" && <button type="button" disabled={sending || !state.conversation?.can_send} onClick={() => void store.retry(item.clientId)} className={`${buttonClass} mt-2`}>Retry send</button>}
            </li>)}
          </ul>
        </div>
        {state.readError && <div role="alert" className="px-4 py-2 text-sm text-amber-900">Couldn&apos;t update your unread count. <button type="button" onClick={() => void store.markRead()} className="font-semibold underline">Retry read status</button></div>}
        <form onSubmit={event => { event.preventDefault(); void store.send(); }} className="space-y-3 border-t border-[#E2E8F0] p-4 sm:p-6">
          {!state.conversation?.can_send && <p className="rounded-md bg-[#F1F5F9] p-3 text-sm text-[#475569]">This conversation is read only. You can still view its history and copy any unsent text.</p>}
          <label htmlFor="message-draft" className="block text-sm font-semibold">Your message</label>
          <textarea id="message-draft" value={state.draft} readOnly={!state.conversation?.can_send} maxLength={MESSAGE_LIMIT} rows={3} aria-describedby="message-help" onChange={event => store.setDraft(event.target.value)} className="block w-full resize-y rounded-md border border-[#CBD5E1] p-3 text-sm focus:border-[#114160] focus:outline-2 focus:outline-[#114160]" />
          <div className="flex flex-wrap items-center justify-between gap-3"><p id="message-help" className="text-xs text-[#475569]">{state.draft.length}/{MESSAGE_LIMIT} characters. Plain text only.</p><button type="submit" disabled={!state.conversation?.can_send || sending || !state.draft.trim() || state.draft.trim().length > MESSAGE_LIMIT} className="rounded-md bg-[#114160] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#092130] disabled:cursor-not-allowed disabled:opacity-50">Send message</button></div>
        </form>
      </>}
    </section>
  );
}
