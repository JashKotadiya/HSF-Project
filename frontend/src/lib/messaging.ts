import supabase from "@/lib/supabase";
import type { ApplicationStatus } from "@/lib/applications";
import type {
  ApplicationConversation,
  ConversationListItem,
  Message as RpcMessage,
} from "@/lib/conversations";
import { CONVERSATION_RPCS } from "@/lib/conversations";

export const MESSAGE_LIMIT = 3000;
export const MESSAGE_PAGE_SIZE = 50;
export const MESSAGE_POLL_MS = 10000;

export type Conversation = {
  id: string | null;
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
};

export type MessageCursor = { created_at: string; id: string };

export type MessagePage = { messages: Message[]; has_more: boolean };

export interface MessagingAPI {
  list(): Promise<Conversation[]>;
  open(applicationId: string): Promise<Conversation>;
  history(conversationId: string | null, before?: MessageCursor | null): Promise<MessagePage>;
  send(applicationId: string, body: string, clientId: string): Promise<Message>;
  read(conversationId: string, messageId: string): Promise<void>;
}

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

function firstRow<T>(data: T | T[]): T {
  if (Array.isArray(data)) {
    if (!data.length) throw new Error("Couldn't load messaging data. Please try again.");
    return data[0];
  }
  return data;
}

function participantName(row: Pick<ApplicationConversation, "caller_role" | "organization_name">) {
  if (row.caller_role === "volunteer") return row.organization_name?.trim() || "Organization";
  return "Volunteer";
}

function mapConversation(
  row: ApplicationConversation & Partial<ConversationListItem>,
): Conversation {
  return {
    id: row.conversation_id,
    application_id: row.application_id,
    project_id: row.project_id,
    project_title: row.project_title?.trim() || "Project",
    participant_name: participantName(row),
    application_status: row.application_status as ApplicationStatus,
    can_send: row.can_send,
    unread_count: Number(row.unread_count ?? 0),
    last_message: row.last_message_body ?? null,
    updated_at: row.last_message_created_at ?? "",
  };
}

function mapMessage(row: RpcMessage): Message {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    client_id: row.client_message_id,
    body: row.body,
    created_at: row.created_at,
  };
}

export function messageCursor(message: Pick<Message, "created_at" | "id">): MessageCursor {
  return { created_at: message.created_at, id: message.id };
}

export function compareMessages(
  a: Pick<Message, "created_at" | "id">,
  b: Pick<Message, "created_at" | "id">,
) {
  if (a.created_at < b.created_at) return -1;
  if (a.created_at > b.created_at) return 1;
  return a.id.localeCompare(b.id);
}

export const messagingAPI: MessagingAPI = {
  async list() {
    const rows = await rpc<ConversationListItem[]>(CONVERSATION_RPCS.list);
    return (Array.isArray(rows) ? rows : []).map(mapConversation);
  },

  async open(applicationId) {
    const rows = await rpc<ApplicationConversation[]>(CONVERSATION_RPCS.get, {
      p_application_id: applicationId,
    });
    return mapConversation(firstRow(rows));
  },

  async history(conversationId, before = null) {
    if (!conversationId) return { messages: [], has_more: false };
    const rows = await rpc<RpcMessage[]>(CONVERSATION_RPCS.messages, {
      p_conversation_id: conversationId,
      p_before_created_at: before?.created_at ?? null,
      p_before_id: before?.id ?? null,
      p_page_size: MESSAGE_PAGE_SIZE,
    });
    const messages = (Array.isArray(rows) ? rows : []).map(mapMessage);
    return { messages, has_more: messages.length >= MESSAGE_PAGE_SIZE };
  },

  async send(applicationId, body, clientId) {
    const row = await rpc<RpcMessage>(CONVERSATION_RPCS.send, {
      p_application_id: applicationId,
      p_body: body,
      p_client_message_id: clientId,
    });
    return mapMessage(firstRow(row));
  },

  async read(conversationId, messageId) {
    await rpc(CONVERSATION_RPCS.markRead, {
      p_conversation_id: conversationId,
      p_message_id: messageId,
    });
  },
};

export function messageLink(applicationId: string) {
  return `/messages?application=${encodeURIComponent(applicationId)}`;
}

export function mergeMessages(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort(compareMessages);
}
