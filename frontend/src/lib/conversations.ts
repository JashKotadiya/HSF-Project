/** Contract for application messaging RPCs (see supabase/conversations.sql). */

export const MESSAGE_MAX_LENGTH = 4000;

export const CONVERSATION_RPCS = {
  send: "send_application_message",
  list: "list_conversations",
  messages: "list_messages",
  get: "get_application_conversation",
  markRead: "mark_conversation_read",
} as const;

export type ConversationCallerRole = "volunteer" | "owner";

/** Row shape of the `messages` table / send_application_message result. */
export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  client_message_id: string;
}

/** Row shape of the `conversation_reads` table / mark_conversation_read result. */
export interface ConversationRead {
  conversation_id: string;
  user_id: string;
  last_read_message_id: string | null;
  last_read_at: string;
}

/** Result row from get_application_conversation. */
export interface ApplicationConversation {
  conversation_id: string | null;
  application_id: string;
  application_status: string;
  project_id: string;
  project_title: string | null;
  organization_name: string | null;
  volunteer_id: string;
  owner_id: string;
  caller_role: ConversationCallerRole;
  can_send: boolean;
}

/** Result row from list_conversations. */
export interface ConversationListItem extends ApplicationConversation {
  conversation_id: string;
  last_message_id: string | null;
  last_message_body: string | null;
  last_message_created_at: string | null;
  last_message_sender_id: string | null;
  last_read_message_id: string | null;
  last_read_at: string | null;
  unread_count: number;
}
