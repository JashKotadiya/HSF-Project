"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useConversations } from "@/components/messaging/useConversations";
import MessagingWorkspace from "@/components/messaging/MessagingWorkspace";
import { messageLink } from "@/lib/messaging";
import type { AppRole } from "@/lib/roles";

export default function MessagingDock() {
  const { user, role, loading } = useAuth();
  const pathname = usePathname();
  if (loading || !user || !role || pathname === "/messages" || pathname?.startsWith("/messages/")) return null;
  return <Dock key={user.id} userId={user.id} role={role} />;
}
function Dock({ userId, role }: { userId: string; role: AppRole }) {
  const [open, setOpen] = useState(false);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const inbox = useConversations();
  const launcher = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const unread = inbox.conversations.reduce((sum, conversation) => sum + conversation.unread_count, 0);
  const close = () => { restoreFocus.current = true; setOpen(false); };
  useEffect(() => {
    if (!open && restoreFocus.current) { launcher.current?.focus(); restoreFocus.current = false; }
  }, [open]);
  return <>
    <div aria-hidden="true" className="h-24" />
    {!open && <button ref={launcher} type="button" aria-haspopup="dialog" aria-expanded={false} aria-controls="messaging-panel" onClick={() => setOpen(true)} className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] inline-flex min-h-12 items-center gap-3 rounded-full border border-white/20 bg-[#114160] px-5 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-[#092130] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2182BF] sm:right-6" aria-label={`Open messages${!inbox.error && unread ? `, ${unread} unread` : ""}`}>
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 2V11.5A8.5 8.5 0 0 1 9.5 3h3a8.5 8.5 0 0 1 8.5 8.5Z" /></svg>
      Messages{!inbox.error && unread > 0 && <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[#114160]">{unread > 99 ? "99+" : unread}</span>}
    </button>}
    {open && <MessagePanel onClose={close}>
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[#E2E8F0] bg-[#114160] px-4 py-3 text-white"><div><h2 id="messaging-panel-title" className="font-bold">Messages</h2><Link href={applicationId ? messageLink(applicationId) : "/messages"} className="inline-block py-1 text-xs text-[#D3E6F2] underline">Open full inbox</Link></div><button type="button" autoFocus onClick={close} aria-label="Close messages" className="flex h-11 w-11 items-center justify-center rounded-lg text-2xl hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white">×</button></header>
      <MessagingWorkspace compact userId={userId} role={role} inbox={inbox} applicationId={applicationId} onSelect={setApplicationId} />
    </MessagePanel>}
  </>;
}
function MessagePanel({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.show();
    dialog.current?.querySelector<HTMLButtonElement>('button[aria-label="Close messages"]')?.focus();
  }, []);
  return <dialog ref={dialog} id="messaging-panel" aria-labelledby="messaging-panel-title" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }} className="fixed inset-auto right-2 bottom-[max(.5rem,env(safe-area-inset-bottom))] z-[60] m-0 h-[min(44rem,calc(100dvh-1rem))] max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-[#CBD5E1] bg-white p-0 text-[#0F172A] shadow-2xl open:flex sm:right-6 sm:bottom-6 sm:h-[min(44rem,calc(100dvh-3rem))]">{children}</dialog>;
}
