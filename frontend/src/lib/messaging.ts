import supabase from "@/lib/supabase";
import type { ApplicationStatus } from "@/lib/applications";

export const MESSAGE_LIMIT = 3000;
export const MESSAGE_PAGE_SIZE = 50;
export const MESSAGE_POLL_MS = 10000;

export type Conversation = {
  id: string;
  application_id: string;
  project_id: string;
  project_title: string;
  participant_name: string;
  application_status: ApplicationStatus;
  can_send: boolean;
  unread_count: number;
  last_message: string | null;
  updated_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  client_id: string;
  body: string;
  created_at: string;
  // Decimal strings preserve PostgreSQL bigint precision.
  sequence: string;
};

export type MessagePage = { messages: Message[]; has_more: boolean };
export interface MessagingAPI {
  list(): Promise<Conversation[]>;
  open(applicationId: string): Promise<Conversation>;
  details(conversationId: string): Promise<Conversation>;
  history(conversationId: string, before?: string, after?: string): Promise<MessagePage>;
  send(conversationId: string, body: string, clientId: string): Promise<Message>;
  read(conversationId: string, throughSequence: string): Promise<void>;
}

// The proposed RPC contract for backend issue #63 is documented in docs/messaging-api.md.
// There is intentionally no client-side substitute for authorization or persistence.
async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("Messaging is not available yet. Please try again later.");
    }
    if (error.code === "42501" || error.code === "PGRST301" || error.code === "PGRST303") {
      throw new Error("This conversation is unavailable for your account. Refresh or sign in again.");
    }
    throw new Error("Couldn't complete the messaging request. Please try again.");
  }
  if (data === null) throw new Error("Couldn't load messaging data. Please try again.");
  return data as T;
}

export const messagingAPI: MessagingAPI = {
  list: () => rpc("list_application_conversations"),
  open: applicationId => rpc("open_application_conversation", { p_application_id: applicationId }),
  details: conversationId => rpc("get_application_conversation", { p_conversation_id: conversationId }),
  history: (conversationId, before, after) => rpc("get_conversation_messages", {
    p_conversation_id: conversationId, p_before: before ?? null, p_after: after ?? null, p_limit: MESSAGE_PAGE_SIZE,
  }),
  send: (conversationId, body, clientId) => rpc("send_conversation_message", {
    p_conversation_id: conversationId, p_body: body, p_client_id: clientId,
  }),
  read: async (conversationId, throughSequence) => {
    await rpc("mark_conversation_read", { p_conversation_id: conversationId, p_through_sequence: throughSequence });
  },
};

export function messageLink(applicationId: string) {
  return `/messages?application=${encodeURIComponent(applicationId)}`;
}

export function mergeMessages(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map(current.map(message => [message.id, message]));
  incoming.forEach(message => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => BigInt(a.sequence) < BigInt(b.sequence) ? -1 : BigInt(a.sequence) > BigInt(b.sequence) ? 1 : a.id.localeCompare(b.id));
}
