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
5. Populate the initially empty VidMatch catalog with the reviewed manifest using `npm run vidmatch:catalog -- import --env-file .env.local --target-per-level 200 --write` after configuring the server-only Supabase and YouTube credentials. The protected ingestion endpoint only discovers candidates; it cannot approve unknown content. Database migrations do not fabricate a video catalog. See the [current deployment walkthrough](../docs/deployment-current-setup.md). VocabStream lessons are already shipped as JSON in `public/vocabstream/data`.
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

## VidMatch curated catalog migration (not a hosted deployment)

`20260930000100_vidmatch_curation.sql` adds private discovery/run/evaluation records, separate editorial provenance and provider freshness, expiring worker leases, and transactional publication. It does not add fabricated content or overwrite existing editorial labels. Apply it only through the migration workflow above, after reviewing a backup/staging copy. Code using the new fields/RPCs must be deployed after this migration.

Existing catalog/history rows receive a 30-day **adoption retention window**, not a fabricated verification timestamp. Their availability starts `unknown`. Run curated-manifest approval after migration: a matching-level legacy seed can gain provenance and become active without changing its existing level, skills, topics, accent, or quality score. A conflicting level remains unactivated and is reported as an activation conflict, requiring explicit review. Merely refreshing provider metadata does not certify editorial quality.

The committed transcript SQL remains available but this pipeline does not depend on any uncommitted transcript service. Caption presence means the provider reports captions, not that this application acquired a transcript. Approval does not require a transcript API, and provider popularity statistics are not a grading input.

### Durable records and permissions

- `vidmatch_ingestion_runs`: unique stable run key, evaluator version/configuration, lease token/expiry, terminal state, safe metrics/error code.
- `vidmatch_candidates`: unique video ID, own discovery context, purgeable provider snapshot/hash/timestamps, work stage, retry time and expiring claim. Rejections remain durable; expired snapshots enter `stale` until fresh discovery.
- `vidmatch_evaluations`: one result per run/video, stable evaluation UUID, input hash, retry digest, decision/reasons, own editorial rationale, separate purgeable provider snapshot, and publication result. Editorial rationale must not contain copied provider titles/descriptions or private user content.
- Catalog additions: channel ID, content format, confidence, CEFR range, review timestamp, latest evaluation, availability/check timestamps, two-strike state and provider expiry. Confidence is an editorial confidence category represented numerically, not a calibrated statistical probability.
- History gains its own provider snapshot expiry. Learning identities, click counts, activity dates, and own classifications survive metadata redaction.

Only `service_role` can read/write pipeline tables or invoke public pipeline RPCs. Browser roles receive neither table grants nor executable RPC grants; RLS is enabled. Functions use a fixed empty search path. Worker authentication remains the responsibility of the existing protected server routes; never provide a service key to the browser.

### RPC contract

Every RPC returns a scalar JSON object. All discovery, result, and check batches contain at most 50 items; candidate/result batches must have unique video IDs.

| RPC | Parameters | Result / behavior |
| --- | --- | --- |
| `begin_vidmatch_ingestion_run` | `p_run_key text`, `p_evaluator_version text`, `p_config jsonb`, `p_lease_seconds integer = 900` | `{run_id, lease_token, lease_until, status, claimed}`. Lease range 30–3600 seconds. Duplicate active/finished runs return `claimed:false` and no token. Expired/failed runs can recover the same ID with a new token; changed configuration under the same key fails. |
| `stage_vidmatch_candidates` | `p_run_id uuid`, `p_lease_token uuid`, `p_candidates jsonb` | `{staged}`. Stores discovery without publishing. Other workers' live claims and newer metadata are preserved. A live claim owner may rebind fresh provider metadata/current review hash before commit. Same rejected input/version respects its retry time. |
| `claim_vidmatch_candidates` | `p_run_id uuid`, `p_lease_token uuid`, `p_limit integer = 25` | `{candidates:[rows]}`. Claims due fresh candidates with `FOR UPDATE SKIP LOCKED`; recovers expired claims. One evaluation per video per run. |
| `commit_vidmatch_evaluations` | `p_run_id uuid`, `p_lease_token uuid`, `p_results jsonb` | `{approved,rejected,deferred,inserted,existing,activation_conflicts}`. Stores evaluation and catalog changes in one transaction. Identical retries return the recorded result; changed retries fail. Expired/replaced tokens cannot perform new work. |
| `finish_vidmatch_ingestion_run` | `p_run_id uuid`, `p_lease_token uuid`, `p_status text`, `p_metrics jsonb`, `p_error_code text = null` | `{run_id,status}`. Status is `completed`, `partial`, or `failed`. Releases unfinished claims. The same final request is idempotent. |
| `refresh_vidmatch_provider_metadata` | `p_checks jsonb` | `{active,suspect,inactive,transient,ignored,unknown}`. Refreshes provider fields and availability only; never changes editorial judgments. |
| `purge_expired_vidmatch_provider_data` | `p_limit integer = 50` | `{purged,remaining,catalog,history,candidates,evaluations}`. Total rows changed is at most the limit. Repeat while `remaining:true`, subject to a bounded job budget; report an incomplete purge so the next scheduled run resumes it. |

A candidate is:

```json
{
  "video_id": "Abcdef12345",
  "discovery_source": "manual",
  "discovery_context": {"query": "own search query"},
  "provider_metadata": {"title": "provider title", "channel_name": "provider channel", "channel_id": "provider ID", "thumbnail_url": "https://i.ytimg.com/vi/Abcdef12345/hqdefault.jpg", "duration": "PT5M", "description": "provider description", "tags": [], "captions_available": true, "privacy_status": "public", "upload_status": "processed", "age_restricted": false, "embeddable": true, "region_restricted": false, "live": false},
  "metadata_checked_at": "ACTUAL_FETCH_TIME_ISO8601",
  "input_sha256": "64_lowercase_hex_characters"
}
```

An evaluation is `{video_id,evaluation_id,input_sha256,decision,reason_codes,evidence,editorial,retry_after?}`. `decision` is `approved`, `rejected`, or `deferred`. The evidence object contains independently authored rationale and source identifiers, not a second provider-metadata copy. Approved editorial payloads require `level`, `skills[]`, `topics[]`, `quality_score` (0–100), `classification_confidence` (0–1), and `editorial_reviewed_at`; optional fields are `accent`, `content_format`, `level_min`, `level_max`. The level must be inside any supplied range. Rejected/deferred evaluations can supply an empty editorial object. Deferred results require a future `retry_after`. IDs must match the claimed snapshot/hash. Approval requires fresh public/processed, embeddable, non-age-restricted, non-region-restricted, non-live metadata; an invalid item rolls back its whole batch.

The worker records `review_available` and the current independent `review_sha256` in discovery context. It skips unchanged approved records and rejected/deferred cooldowns before spending metadata quota. Claims from earlier runs are rechecked and rebound to the exact current provider/review hash before publication. Provider search results alone never supply missing English or CEFR evidence. Reservation RPCs (`begin`, `claim`, and bounded `purge`) are not automatically retried after an ambiguous lost response; their leases/expiry permit a later safe recovery.

Default worker execution is limited to four claim batches and 180 seconds, checked between bounded operations with headroom for finishing the run. The HTTP cron shares an absolute 240-second budget between health and discovery, reserves the remaining minute for completion, and reports partial discovery when health leaves insufficient time. Catalog pages and legacy channel resolution respect the same deadline. A CLI import can explicitly request up to 40 batches and 600 seconds. Discovery uses the manifest only as an evidence lookup; importing stages its full contents in bounded batches. `partial` is terminal for its run key so repeated scheduler requests spend no more quota. To continue an incomplete import, use a new unique run key with the same reviewed manifest; already approved unchanged rows are skipped and released pending claims are available. Failed/expired attempts can recover the same run key. Health maintenance purges up to 20 batches of 50 expired provider snapshots by default within its 60-second budget, stopping early when drained. It reports `remaining:true` when the time or batch budget leaves a backlog; a later bounded maintenance invocation can continue.

A refresh check is `{video_id,status,checked_at,provider_metadata?}`. `status` is `available`, `missing`, `restricted`, or `transient_error`. Only `available` includes the complete normalized provider snapshot above. All timestamps represent actual observations; future timestamps beyond five minutes fail. Older/duplicate confirmed checks are ignored. A first confirmed missing/restricted observation sets `suspect` and is excluded from recommendations immediately. A second distinct observation at least 24 hours after the first sets `inactive`. Early confirmations remain suspect; transport/API errors do not add a strike or prolong provider-data expiry. Success resets strikes; reviewed entries become active, unreviewed entries remain unknown.

### Availability and retention operations

Recommendations must require all of:

```text
availability_status = active
editorial_reviewed_at is not null
provider_metadata_expires_at > current time
```

Apply the same rules to similarity candidates and source visibility. Run provider rechecks well before 30 days, with each successful snapshot expiring no later than 30 days after its actual fetch. Run bounded purge batches on the scheduled job even if provider refresh fails. Do not report a provider outage as confirmed deletion, and do not refresh `metadata_checked_at` from a cached observation merely to extend expiry.

Purge replaces expired catalog/history provider titles with an application-authored unavailable placeholder, removes copied channel/thumbnail/duration/description/tags metadata where present, and marks catalog entries inactive. It preserves catalog rows, video identifiers/canonical links, own editorial fields/evidence, and learning history identities/activity. Expired candidate/evaluation provider snapshots are cleared separately. Expiry becomes null after redaction so repeated bounded purges advance; inactive/stale status prevents accidental reuse. Fresh discovery can restart evaluation and fresh verified provider data can restore already reviewed content. The existing history-write RPC propagates catalog expiry on each new click so historical copies cannot persist indefinitely by accident.

Provider copies in files, exported manifests, logs, and external backups need their own retention handling; database purge cannot erase those. Store durable manual annotations separately from expiring provider snapshots. This migration deliberately does not delete preexisting transcript text without ownership/source provenance: review the retention rules for those separate transcript records before enabling any transcript acquisition pipeline.

### Additional SQL validation

```sh
PGLITE_MODULE=/tmp/projectfluence-sql-validation/node_modules/@electric-sql/pglite/dist/index.js node --experimental-strip-types scripts/validate-vidmatch-curation-db.mjs
```

The suite exercises adoption of legacy catalog rows, duplicate schedules, staged publication, identical/conflicting retries, rejected/deferred records, transactional rollback, recovered leases, matching-level activation without editorial overwrite, level conflicts, the 24-hour confirmation rule, transient failures, provider-only refresh, bounded metadata redaction preserving learning history, stale rediscovery, role denial, owned claim rebinding, and the real TypeScript worker's RPC sequence. It runs only against an isolated PostgreSQL/WASM instance with provider fixtures. Full Supabase/PostgREST execution and simultaneous independent PostgreSQL connections remain staging checks; the embedded engine serializes calls.
