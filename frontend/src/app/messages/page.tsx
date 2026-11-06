import { Suspense } from "react";
import MessagingInbox from "@/components/messaging/MessagingInbox";

export default function MessagesPage() {
  return <Suspense fallback={<p role="status" className="p-6">Loading messages...</p>}><MessagingInbox /></Suspense>;
}
