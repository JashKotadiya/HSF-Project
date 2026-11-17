# Messaging UI and API

The messaging screens at `/messages` talk to the Supabase RPCs defined in [`supabase/conversations.sql`](../supabase/conversations.sql). The TypeScript shapes live in [`frontend/src/lib/conversations.ts`](../frontend/src/lib/conversations.ts). The UI adapter in [`frontend/src/lib/messaging.ts`](../frontend/src/lib/messaging.ts) maps those RPC rows into inbox and conversation views.

Application deep links use `/messages?application=<application UUID>`. Both volunteers and organizations use the same screens. Missing RPCs (`PGRST202` / `42883`) show “Messaging is not available yet.” Apply `conversations.sql` in the Supabase SQL editor before expecting a live inbox.

## RPCs used by the frontend

| RPC | Arguments | Behavior |
| --- | --- | --- |
| `list_conversations` | None | Caller's conversations with unread counts and last-message preview. |
| `get_application_conversation` | `p_application_id` | Context for one application. Does not create a conversation row. `conversation_id` may be null until the first send. |
| `list_messages` | `p_conversation_id`, optional `p_before_created_at` + `p_before_id`, `p_page_size` | Newest page when cursors are omitted. Older pages use both before-cursors together. Messages are ordered by `(created_at, id)`. |
| `send_application_message` | `p_application_id`, `p_body`, `p_client_message_id` | Creates the conversation on first send if needed. Retries with the same client id return the original message. Bodies that are empty or contain only whitespace (spaces, tabs, line breaks) are rejected with `23514`. |
| `mark_conversation_read` | `p_conversation_id`, optional `p_message_id` | Advances the caller's read cursor forward only. |

The composer enforces a 3,000-character limit. The database allows 4,000 characters.

## Messaging entry points

Signed-in users have one Messages launcher at the bottom right of application pages. It opens a nonmodal side panel, so users can keep their place in the application. Escape or Close messages closes the panel and returns focus to the launcher. The panel and full inbox share the conversation view, sending logic, and account-scoped tab drafts.

The navbar still links to `/messages`. The floating launcher and side panel are not mounted on that dedicated page. Open full inbox in the panel keeps the selected application in the URL, with drafts restored from the same account/application storage key.

Use New message in either surface to choose a pending or approved application, including one with no messages yet. The picker queries authorized applications in pages of 30, requests names and project context without email addresses, and resolves closed-project context through the existing participant-authorized conversation RPC when discovery RLS hides a project. Sending still rechecks membership and status through the existing RPC. Historical rejected conversations remain accessible in the inbox.

The old per-card Message organization and Message volunteer links have been removed in favor of these shared entry points. No new SQL setup is required by this UI change.

## Frontend checks

```sh
cd frontend
npm run test:messaging
npm run test:auth
npm run test:applications
npm run lint
```

For browser verification, check both roles with controlled data: consistent launcher placement across pages, unread updates, opening and closing with Escape, keyboard focus return, new conversations and picker retry, failed-send retry, drafts after panel close and full-inbox navigation, older history, rejected read-only history, logout/account changes, and 320px and 390px layouts. The panel is nonmodal and does not trap focus or disable the underlying application.
