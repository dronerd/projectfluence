## Supabase Auth and Progress

Run `apps/vocabstream/supabase/schema.sql` in the Supabase SQL editor before using authenticated progress tracking.

```

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Only the `NEXT_PUBLIC_` variables should be exposed to the browser.

In Supabase Authentication, enable Email and Google providers. Email/password auth uses the user's real email address, which also makes the password reset flow work through Supabase.

Add your deployed site URL and local dev URL to the allowed redirect URLs, for example:

```text
http://localhost:3000
https://your-domain.example
```
