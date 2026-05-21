## Supabase Auth and Progress

Run `apps/vocabstream/supabase/schema.sql` in the Supabase SQL editor before using authenticated progress tracking.

Required environment variables:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_public_anon_key
```

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Only the `NEXT_PUBLIC_` variables should be exposed to the browser.

In Supabase Authentication, enable Email and Google providers. Email/password auth uses the user's real email address, which also makes the password reset flow work through Supabase.

Add your deployed site URL and local dev URL to the allowed redirect URLs, for example:

```text
http://localhost:3000
https://your-domain.example
```
