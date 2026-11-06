# Messaging UI and proposed API for #63

This document describes the contract used by the frontend for #64. The RPCs below are **proposed and not implemented in this PR**. Backend issue #63 must implement or agree changes to this contract before the frontend can be used with real accounts. Keep this PR in draft until that integration and its access-control tests pass.

The UI lives at `/messages`. Application links use `/messages?application=<application UUID>`. Both volunteers and organizations use the same screens and authenticated Supabase client. Missing RPCs produce an unavailable message with retry controls. There is no production mock or client-side persistence of delivered messages.

## Common response shapes

Return JSON objects or arrays directly, not a one-row SQL table wrapper. UUIDs, timestamps and sequences are strings. Nullable fields are explicitly null.

```ts
type Conversation = {
  id: string;
  application_id: string;
  project_id: string;
  project_title: string;
  participant_name: string; // The other participant's display name, never their email.
  application_status: "pending" | "approved" | "rejected";
  can_send: boolean;
  unread_count: number; // Other participant's messages after the caller's read position.
  last_message: string | null;
  updated_at: string; // ISO 8601 timestamp.
};
type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  client_id: string; // UUID generated once per send attempt, reused for retries.
  body: string;
  created_at: string;
  sequence: string; // Positive bigint encoded as decimal text, not a JSON number.
};
type MessagePage = { messages: Message[]; has_more: boolean };
```

The server must assign a unique, immutable, increasing sequence within each conversation. Inserts must be serialized per conversation so a lower sequence cannot commit after a higher one becomes visible. A normal database sequence alone does not guarantee commit order. This requirement prevents cursor pagination from skipping concurrent messages. Timestamp alone is not a sufficient cursor.

## Supabase RPCs

| RPC | Arguments | Response and behavior |
| --- | --- | --- |
| `list_application_conversations` | None | `Conversation[]`, caller's conversations only, newest activity first with deterministic ID tie-breaker. An empty inbox is `[]`. |
| `open_application_conversation` | `p_application_id: uuid` | `Conversation`. Resolve or atomically create the one conversation for the application. Safe to retry. For rejected applications, return existing history or an empty read-only conversation. |
| `get_application_conversation` | `p_conversation_id: uuid` | `Conversation` with current status, permissions and unread count. |
| `get_conversation_messages` | `p_conversation_id: uuid`, `p_before: text or null`, `p_after: text or null`, `p_limit: integer` | `MessagePage`. Both cursors are exclusive. Reject simultaneous non-null cursors. The UI requests 50 messages per page. |
| `send_conversation_message` | `p_conversation_id: uuid`, `p_body: text`, `p_client_id: uuid` | Canonical persisted `Message`, including sequence and timestamp. Repeated requests with the same sender, conversation and client ID return the original message without a duplicate insert. |
| `mark_conversation_read` | `p_conversation_id: uuid`, `p_through_sequence: text` | Non-null JSON, such as `{ "ok": true }`. Advance only the caller's read position, monotonically, to a valid visible sequence in this conversation. |

History behavior:

- No cursor: newest page, returned in ascending sequence order. `has_more` means older history exists.
- `p_before`: nearest older page, returned in ascending order. `has_more` means further older history exists.
- `p_after`: next page after the cursor, returned in ascending order. `has_more` means further newer messages exist. The frontend starts at `"0"` for empty conversations.
- Return `messages: []` and `has_more: false` when there are no matching messages.
- The frontend fetches up to 20 forward pages per refresh, continuing from its last fetched cursor on the next refresh. Send acknowledgements never advance that cursor or the read position, because earlier incoming messages may still need fetching.

## Required backend guarantees

- Derive sender and caller from `auth.uid()`. Resolve both participants from the application and project ownership. Never accept a participant or sender ID from the client.
- Enforce membership on every RPC, with equivalent restrictions on underlying tables. Reject anonymous callers and unrelated users. A UUID in a URL is not authorization.
- Permit sending only while the application is pending or approved. Enforce current status on the server even if the UI has stale metadata. Rejected conversations remain readable by participants.
- Trim messages, reject blank content, and enforce the agreed 3,000 UTF-16 code unit limit (matching browser `maxlength`) or coordinate a different common counting rule with the frontend. Store and return plain text.
- Enforce retry uniqueness transactionally for `(conversation_id, sender_id, client_id)`. Return the original body for repeated keys; do not overwrite delivered content. Previously accepted retries can return the existing record even if the application was subsequently rejected.
- Update unread counts and read positions atomically. Ignore the caller's own messages in unread counts. Never let an older read request move the position backwards.
- Recheck all authorization in database tests using real participant identities, concurrent sends and retries. No service-role secret belongs in the browser.

The frontend maps missing-function errors (`PGRST202`, `42883`) to messaging unavailable, authorization/session errors (`42501`, `PGRST301`, `PGRST303`) to account unavailable, and other errors to a generic retry message. Do not expose private details through error text.

## Frontend behavior and verification

The inbox and selected conversation refresh every 10 seconds while the tab is visible and on focus. Read positions advance only for a visible open conversation. Manual refresh and retry controls are available. Read failures leave the server's unread count authoritative.

Drafts and failed sends live in session storage, scoped by account ID and application ID. This preserves text when switching conversations or refreshing the tab. Storage is local to the tab and is not a cross-device draft service. If browser storage is blocked, text remains in memory while the view is open. Retry reuses the original client ID, including after a page reload.

Run from `frontend`:

```sh
npm install
npm run dev
npm run test:messaging
npm run test:auth
npm run test:applications
npm run lint
npm run build -- --webpack
```

Before removing draft status, connect #63 and verify both roles against a local Supabase database: pending application entry links, ordered history, refresh after another participant replies, unread counts, rejected read-only history, older-message pagination, lost-response retries, unauthorized direct URLs, account switching, keyboard navigation and a narrow mobile viewport. Frontend mock tests do not establish database authorization or hosted integration.
