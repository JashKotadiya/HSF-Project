# Messaging UI and API

The messaging screens at `/messages` talk to the Supabase RPCs defined in [`supabase/conversations.sql`](../supabase/conversations.sql). The TypeScript shapes live in [`frontend/src/lib/conversations.ts`](../frontend/src/lib/conversations.ts). The UI adapter in [`frontend/src/lib/messaging.ts`](../frontend/src/lib/messaging.ts) maps those RPC rows into inbox and conversation views.

Application deep links use `/messages?application=<application UUID>`. Both volunteers and organizations use the same screens. Missing RPCs (`PGRST202` / `42883`) show “Messaging is not available yet.” Apply `conversations.sql` in the Supabase SQL editor before expecting a live inbox.

## RPCs used by the frontend

| RPC | Arguments | Behavior |
| --- | --- | --- |
| `list_conversations` | None | Caller's conversations with unread counts and last-message preview. |
| `get_application_conversation` | `p_application_id` | Context for one application. Does not create a conversation row. `conversation_id` may be null until the first send. |
| `list_messages` | `p_conversation_id`, optional `p_before_created_at` + `p_before_id`, `p_page_size` | Newest page when cursors are omitted. Older pages use both before-cursors together. Messages are ordered by `(created_at, id)`. |
| `send_application_message` | `p_application_id`, `p_body`, `p_client_message_id` | Creates the conversation on first send if needed. Retries with the same client id return the original message. |
| `mark_conversation_read` | `p_conversation_id`, optional `p_message_id` | Advances the caller's read cursor forward only. |

The composer enforces a 3,000-character limit. The database allows 4,000 characters.

## Frontend checks

```sh
cd frontend
npm run test:messaging
npm run test:auth
npm run test:applications
npm run lint
```
