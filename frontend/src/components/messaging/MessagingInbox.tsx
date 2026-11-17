"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import MessagingWorkspace from "@/components/messaging/MessagingWorkspace";
import { useConversations } from "@/components/messaging/useConversations";
import { messageLink } from "@/lib/messaging";
import type { AppRole } from "@/lib/roles";

export default function MessagingInbox() {
  const { user, role, loading } = useAuth();
  const applicationId = useSearchParams().get("application");
  if (loading) return <p role="status" className="p-6">Loading your account...</p>;
  if (!user || !role) return <main className="mx-auto max-w-xl p-6"><h1 className="text-2xl font-bold">Messages</h1><p className="my-4">Sign in to see your conversations.</p><Link href="/" className="text-[#114160] underline">Log in</Link></main>;
  return <Inbox key={user.id} userId={user.id} role={role} applicationId={applicationId} />;
}
function Inbox({ userId, role, applicationId }: { userId: string; role: AppRole; applicationId: string | null }) {
  const inbox = useConversations();
  const router = useRouter();
  return <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
    <header className="mb-6"><p className="text-xs font-bold uppercase tracking-widest text-[#64748B]">Your connections</p><h1 className="mt-2 text-3xl font-bold text-[#092130]">Messages</h1><p className="mt-2 text-sm text-[#475569]">Every conversation, connected to a project.</p></header>
    <MessagingWorkspace userId={userId} role={role} inbox={inbox} applicationId={applicationId} onSelect={id => router.push(id ? messageLink(id) : "/messages", { scroll: false })} />
  </main>;
}
