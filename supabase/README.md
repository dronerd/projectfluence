# ProjectFluence database deployment

The canonical migration chain is **`supabase/migrations` at the repository root**. The three `apps/*/supabase/schema.sql` files and VidMatch's per-app migration are historical setup snapshots. Do not rerun those snapshots after the root migrations: they would replace hardened functions and grants with older definitions.

## What is deployed

- `20260929000100_application_baseline.sql`: profiles, VocabStream attempts/questions/progress/mistakes, SpeakWise settings/sessions/summaries/mistake patterns, VidMatch catalog/history/settings; foreign keys, indexes, owner-read RLS, signup trigger.
- `20260929000200_transcript_foundation.sql`: transcript metadata/chunks and the atomic snapshot RPC. This copies the existing VidMatch transcript foundation into the root migration chain without editing that work.
- `20260929000300_atomic_learning_writes.sql`: transactional VocabStream writes with stable attempt IDs; session ownership and idempotent SpeakWise summaries; catalog-backed atomic VidMatch click counters; server-side analytics without the 1000-row REST ceiling; explicit grants and restricted function execution; score constraints; a signup trigger resilient to duplicate username metadata.

All account-scoped reads are protected by RLS. Browsers can read their own learning rows and update only their own profile username/display name. New learning writes go through authenticated Next.js routes that verify the user's access token, then invoke service-role-only database functions with that verified user ID. Catalog and transcript tables remain inaccessible to anonymous/authenticated direct database clients.

The app does **not** use Supabase Storage, Realtime, Edge Functions, database webhooks, or a direct database connection at runtime. VidMatch opens videos on YouTube; SpeakWise FastAPI serves audio. No buckets, Storage policies, uploads, persistent Render disks, or Edge Function secrets need provisioning for these workflows. Do not make a bucket public to troubleshoot YouTube playback.

## Clean hosted project

1. Create/select a Supabase project. Save its project reference, API URL, browser publishable/anon key, and server secret/service-role key in the deployment provider's environment settings. Never commit values.
2. From this repository's root, with Supabase CLI installed (or `npx supabase`):

   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push --dry-run
   npx supabase db push
   npx supabase migration list
   ```

   Linking/pushing may prompt for the project database password. The CLI credentials/database password are deployment-only and are not needed by Next.js or FastAPI. Apply migrations **before** deploying code that calls the new RPCs.
3. In Authentication → Providers enable Email, email confirmation, and configure production SMTP before inviting real users. Configure Google only if offering the existing Google sign-in button: put Google OAuth client ID/secret in Supabase; Google's authorized redirect URI is `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` (use the project's displayed callback if a custom domain is configured).
4. Once the frontend's Render/custom-domain HTTPS URL is known, set Authentication → URL Configuration → Site URL to that origin. Add the exact frontend origin/root and `https://YOUR_FRONTEND/auth/reset-password` to Redirect URLs. The app's OAuth and signup flows return to the frontend origin; recovery uses `/auth/reset-password`. Add localhost only for active development; do not use broad wildcard production redirects.
5. Populate the initially empty VidMatch catalog with the protected ingestion endpoint after configuring its admin token and YouTube API key. Database migrations do not fabricate a video catalog. VocabStream lessons are already shipped as JSON in `public/vocabstream/data`.
6. Run the production smoke checklist in the deployment guide, including two-user access checks and repeated progress save after a simulated dropped response.

`config.toml` describes the **local** stack. `supabase db push` applies SQL; it does not synchronize hosted Auth URLs, SMTP, OAuth credentials, API keys, or other dashboard settings from that local config. Those are the explicit one-time hosted configuration steps above. There are no Edge Functions to deploy.

## Existing project provisioned from per-app SQL

Take a backup and test on a staging copy first. `db push --dry-run` shows the pending root migrations. The baseline and transcript foundation use idempotent creation, so projects already provisioned using the checked-in per-app SQL can apply them as pending migrations; existing learner rows and transcript content are retained. No migration deletes/deduplicates historical attempts or summaries. Do not mark the hardening migration applied without executing it.

If the database has additional manual changes or a separately tracked migration history, inspect `supabase migration list` and compare a schema dump before deployment. Resolve that drift explicitly; do not reset production or blindly run migration repair. The migration chain cannot infer undocumented dashboard modifications.

Two new score constraints use `NOT VALID`: PostgreSQL enforces them on new or updated rows while preserving preexisting invalid records. Audit historical records before validating them:

```sql
select id from public.vocabstream_lesson_attempts
where meaning_score > meaning_total or quiz_score > quiz_total or replay_correct > replay_total
   or total_score <> meaning_score + quiz_score or total_possible <> meaning_total + quiz_total;
select id from public.vocabstream_user_lesson_progress
where meaning_score > meaning_total or quiz_score > quiz_total or replay_correct > replay_total
   or total_score <> meaning_score + quiz_score or total_possible <> meaning_total + quiz_total;
-- After resolving any existing violations from their source evidence:
alter table public.vocabstream_lesson_attempts validate constraint vocabstream_attempt_score_bounds;
alter table public.vocabstream_user_lesson_progress validate constraint vocabstream_progress_score_bounds;
```

Existing SpeakWise summaries for a session are retained; subsequent retries return the first owned summary without incrementing mistake counters again. New writes from the application use the transactional RPC. A database owner can still intentionally bypass application-level RPC conventions with direct SQL.

## Configuration locations

| Variable/value | Obtain from | Location | Secret? | Purpose |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project Settings → API/Data API | Render Next.js build + runtime | No | Browser auth endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase API Keys: publishable key or legacy anon key | Render Next.js build + runtime | No | Browser auth; RLS limits data access |
| `SUPABASE_URL` | Same project API URL | Render Next.js and SpeakWise servers | No | Server token verification / REST API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase API Keys: server secret or legacy service-role key | Render Next.js server only | **Yes** | Privileged database calls after verified user ownership; never prefix with `NEXT_PUBLIC_` |
| `SUPABASE_ANON_KEY` | Same browser publishable/anon key | Render SpeakWise server | No | User-token verification; no elevated database access |
| `SUPABASE_ACCESS_TOKEN` | Supabase account access tokens, if using CLI automation | Deployment CI only, optional | **Yes** | Noninteractive CLI auth; use `supabase login` locally instead |
| Database password | Chosen when creating project / Database Settings | CLI prompt or protected CI secret only | **Yes** | Migration connection, never browser or app runtime |
| Site URL / Redirect URLs | Frontend's final Render/custom-domain origin | Supabase Auth URL Configuration | No | Confirmation/OAuth/recovery destination |
| Google OAuth client ID/secret | Google Cloud OAuth application | Supabase Auth provider configuration | Secret for secret | Optional Google sign-in |
| SMTP credentials | Your mail provider | Supabase Auth SMTP | **Yes** | Production confirmation/recovery emails |

`.env.local` is for local development only and is ignored by Git. `NEXT_PUBLIC_*` values are embedded at build time: changing the Supabase project requires rebuilding the frontend.

## Local validation

With Docker and Supabase CLI installed:

```sh
npx supabase start
npx supabase db reset
npx supabase db lint --local
```

`db reset` above is explicitly **local**; never reset a production database. The local config enables email confirmation; use the local mail viewer for confirmation messages.

A lightweight PostgreSQL/WASM test suite also exercises the real SQL without network or hosted credentials:

```sh
npm install --prefix /tmp/projectfluence-sql-validation --no-save @electric-sql/pglite@0.3.14
PGLITE_MODULE=/tmp/projectfluence-sql-validation/node_modules/@electric-sql/pglite/dist/index.js node scripts/validate-database.mjs
```

This uses minimal `auth.users`/`auth.uid()` and role fixtures. It verifies migration adoption, transactions/rollback, stable-ID retries, privileged RPC grants, RLS ownership, signup collisions, counters, and analytics above 1000 rows. PGlite has core `gen_random_uuid()` but not the unused `pgcrypto` package, so the test omits only `CREATE EXTENSION pgcrypto`. It serializes connections; it does not prove multi-connection contention behavior, hosted Auth, PostgREST shape, or real OAuth delivery. Complete the full Supabase staging smoke checks before production.

References: [Supabase migrations](https://supabase.com/docs/guides/local-development/database-migrations), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database function grants](https://supabase.com/docs/guides/database/functions), [local CLI config](https://supabase.com/docs/guides/local-development/cli/config), [Auth redirects](https://supabase.com/docs/guides/auth/redirect-urls).
