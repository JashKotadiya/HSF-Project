# Frontend regression checks

From `frontend/`:

```bash
npm ci
npm run test:auth
npm run test:applications
```

The tests run the real Supabase JavaScript client against mocked HTTP responses. Login-page checks isolate React hooks and navigation while exercising the page's handlers and redirect effect. They need no credentials, create no live accounts, and add no test dependencies beyond the existing frontend installation.

Coverage includes both role mismatches, both matching roles, delayed role verification, failed role lookups, invalid passwords, legacy role aliases, signup behavior, switching to the correct tab, and cleanup of rejected temporary sessions. Browser end-to-end testing and deployed Supabase policy checks remain separate.

Application checks cover status badges and links on Browse Projects, loading and retry behavior, account changes, approval confirmation and cancellation, failed saves, and overlapping decision requests. They execute the actual components with isolated hooks and the real Supabase query builder against mocked HTTP responses. No hosted data or email notifications are used.

Email checks cover the applicant page's "Email applicant" form: the request sent to the `send-custom-email` function, disabled and in-progress states, error messages for rejected, failed and unreadable responses, network failures, retrying, keeping an unsent or failed draft, clearing the draft after a successful send, and confirming that an email neither changes nor blocks the applicant decision. The Edge Function is replaced by a mocked HTTP response, so no email is sent.

Edge Function checks (`npm run test:functions`) run the real `supabase/functions/send-match-emails/index.ts` with the real Supabase JavaScript client against mocked database, Auth and email HTTP. They cover callers without the webhook secret (including a signed-in user with a valid gateway token), a missing secret, malformed events, forged ids, statuses, recipients and project fields, legitimate new-application and approval events, repeated and simultaneous deliveries, and failed sends being retried. No credentials are needed and no email is sent.