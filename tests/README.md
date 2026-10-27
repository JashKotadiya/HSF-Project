# Local application regression checks

From the repository root:

```bash
npm ci
npm --prefix frontend ci
npm run test:local
```

These tests require no Supabase credentials. They execute the application SQL in an in-memory PostgreSQL instance and exercise the application form with isolated React hooks and the real Supabase JavaScript client using mocked HTTP responses. They do not replace browser end-to-end tests or verification against the deployed database.

Coverage includes repeated database setup, migration from an enum status column, preservation of existing application data, RLS boundaries, normal submissions, duplicate submissions, project closure during upload, upload permission failures, and failed status checks.

The existing root `npm test` command runs the separate hosted database checks in `supabase/tests/test-application-rls.mjs`. That command requires the configuration in `supabase/.env` and creates and cleans up test records in the configured project.
