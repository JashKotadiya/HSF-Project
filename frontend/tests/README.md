# Authentication regression checks

From `frontend/`:

```bash
npm ci
npm run test:auth
```

The tests run the real Supabase JavaScript client against mocked HTTP responses. Login-page checks isolate React hooks and navigation while exercising the page's handlers and redirect effect. They need no credentials, create no live accounts, and add no test dependencies beyond the existing frontend installation.

Coverage includes both role mismatches, both matching roles, delayed role verification, failed role lookups, invalid passwords, legacy role aliases, signup behavior, switching to the correct tab, and cleanup of rejected temporary sessions. Browser end-to-end testing and deployed Supabase policy checks remain separate.
