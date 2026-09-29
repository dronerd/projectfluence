# Deploy the current ProjectFluence repository

This runbook uses **Vercel for the Next.js application, Render for SpeakWise FastAPI, and the existing Supabase project for data and authentication**. This matches the intended separation behind the earlier Vercel `requirements.txt` parsing failure. An all-Render alternative is in step 10. The 300-video expansion has been imported and read back from the existing Supabase catalog: it now contains 490 videos, and all original 190 records are unchanged. No hosted migration or application deployment was performed. See the [catalog expansion receipt](vidmatch-catalog-expansion-2026-09.md).

## 1. Select the correct Git revision

The working branch for these changes is `codex/vidmatch-curated-catalog`; the inspection began at `94cd7b8`. The deployment-preparation check found remote branch `94cd7b8377589548e6280dab785027dfcac2f115` and remote `main` at `6d699e3753230ec6c6c131d2955b6e994158a03d`, **not merged**. This is a snapshot, not a permanent branch-status guarantee. Deploy the final reviewed commit containing this runbook and the completed catalog work, rather than redeploying the old failed Vercel revision.

Keep automatic production deployment/promotion paused until database migration and activation are complete. Before deploying, record the final commit shown in GitHub and check that both hosts select that commit/branch. Either merge the reviewed branch through the normal GitHub workflow and deploy the resulting production-branch commit, or explicitly configure both hosts to deploy the reviewed feature branch. Do not force-push or assume `main` contains the changes. The final handoff must separately confirm push/merge status.

From the repository root (the directory containing `package.json`, `app/`, `render.yaml`, and `supabase/`):

```sh
git branch --show-current
git log -1 --oneline
git status --short
git ls-files .vercelignore render.yaml vercel.json api/speakwise/requirements.txt api/speakwise/constraints.txt
```

Verify `.vercelignore` contains `/api/speakwise/`. Keep `app/api/` included: those are the actual Next.js API routes. Vercel supports deployment exclusions in a root `.vercelignore`; Python files under a root `api` directory otherwise participate in Python function detection. The previous parse failure is consistent with Vercel trying to process the separate SpeakWise service's pip constraints directive. Keep `-c constraints.txt` and the pinned Python dependencies; Render installs them with pip. If the same Vercel error recurs, check the deployed SHA, project root, and exclusions before changing requirements. [Vercel deployment exclusions](https://vercel.com/docs/deployments/vercel-ignore), [Vercel Python runtime](https://vercel.com/docs/functions/runtimes/python).

## 2. Know which components are deployed

| Component | Code/root | Host and purpose |
| --- | --- | --- |
| Next.js 15 application | Repository root; `app/`, `apps/`, `lib/`, `public/` | One Vercel Next.js project: frontend, authenticated persistence APIs, VidMatch recommendations and scheduled maintenance |
| SpeakWise FastAPI | `api/speakwise` | One Render **Python Web Service**: authenticated OpenAI text generation and streamed speech |
| Database and Auth | Root `supabase/migrations` | Existing hosted Supabase project: PostgreSQL, RLS, transactional RPCs, email/optional Google login |
| VidMatch scheduler | `vercel.json` and `app/api/vidmatch/cron/daily-youtube/route.ts` | One Vercel cron invocation per day; uses the Next.js server's secrets |
| Vocabulary lessons/images | `public/vocabstream/` | Versioned static assets deployed with Next.js; no separate storage service |
| VidMatch media | Official YouTube URLs | YouTube delivers videos; ProjectFluence stores curated metadata/history and opens YouTube |

There is no separate frontend build per app, no Supabase Edge Function deployment, and no application use of Supabase Storage or Realtime. No Render PostgreSQL database, persistent disk, upload bucket, Redis instance, or standalone worker is required by this implementation. Browser speech recognition supplies SpeakWise input; there is no server STT service/key to provision. `/health` and `/api/health` are liveness checks, not evidence that paid providers or the database are ready.

## 3. Prepare the existing Supabase project without losing the catalog

Use the **same Supabase project that holds the curated VidMatch catalog and any learning history**. Creating another project produces an empty database; GitHub deployment does not copy hosted videos or user records. Save a database backup before schema adoption and test migration on a staging copy if this project has existing/manual schema changes.

The live catalog was verified on **2026-09-29** after an insert-only import: **490 videos** (A1 **37**, A2 **70**, B1 **108**, B2 **110**, C1 **108**, C2 **57**). Exactly **300** were added; every field of the previous **190** rows was unchanged. Curation columns are still absent, so the database migration and reviewed activation below remain necessary. The Git branch protects code changes; these hosted catalog additions already exist in the shared Supabase project.

Use the Supabase dashboard SQL editor for this read-only preflight and save the counts privately:

```sql
select level, count(*) as videos
from public.vidmatch_videos group by level order by level;
select count(*) as history_rows from public.vidmatch_video_view_history;
```

If the tables do not exist, this is a clean project and the preflight counts are zero. Do not delete tables, reset the hosted database, rerun per-app `schema.sql` snapshots, or replace the catalog with a seed file.

Authenticate/link using the CLI from the repository root:

```sh
npx supabase login
npx supabase link --project-ref YOUR_EXISTING_PROJECT_REF
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
npx supabase migration list
```

Review the dry run before the write. The canonical chain has **four** migrations, in this order:

1. `20260929000100_application_baseline.sql` — application tables, ownership policies, grants, indexes, signup profile trigger.
2. `20260929000200_transcript_foundation.sql` — transcript schema and atomic snapshot RPC; no transcript acquisition is enabled by deployment.
3. `20260929000300_atomic_learning_writes.sql` — transactional learning saves, authorization, idempotency, analytics.
4. `20260930000100_vidmatch_curation.sql` — private curation pipeline, availability/freshness fields, worker leases, atomic catalog publication.

The fourth migration preserves existing catalog and history identities. Legacy rows begin with `unknown` availability and an adoption retention window; they are not automatically certified as reviewed/playable. Step 6 handles activation. Migrations supply SQL functions/RLS automatically; no dashboard SQL copy/paste is needed for those objects. If history/schema drift is reported, compare it explicitly rather than applying blanket `migration repair`. Supabase tracks applied migrations independently of Git and pushes only pending migrations. [Supabase migration workflow](https://supabase.com/docs/guides/deployment/database-migrations).

`supabase/config.toml` configures the **local** stack, including local PostgreSQL 17 and localhost redirects. `db push` does not configure hosted SMTP, Auth providers, production URLs, or API keys. Runtime services use Supabase HTTPS APIs, not a `DATABASE_URL` or direct PostgreSQL connection.

## 4. Collect settings in their correct locations

Use the exact variable names below even when using modern Supabase keys: this repository retains the `ANON_KEY` and `SERVICE_ROLE_KEY` names. A publishable key is suitable for browser code; a secret/service-role key is privileged and belongs only in controlled server/admin environments. [Supabase API key roles](https://supabase.com/docs/guides/getting-started/api-keys).

For the primary topology, “Next” below means **Vercel Project → Settings → Environment Variables → Production**. For step 10 it means the Render `projectfluence-web` service environment. Preview environments should use their own staging project/URLs unless deliberately configured otherwise.

| Variable or setting | Where to obtain it | Render / Vercel / Supabase location | Secret? | Purpose |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Existing Supabase project's Connect dialog | Next build and runtime | No | Browser Auth endpoint |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Settings → API Keys: publishable or legacy anon key | Next build and runtime | No | Browser's project key; RLS still applies |
| `NEXT_PUBLIC_SITE_URL` | Final canonical Next HTTPS origin | Next build and runtime | No | Signup, OAuth, recovery and site metadata URLs |
| `NEXT_PUBLIC_SPEAKWISE_API_URL` | Actual Render SpeakWise HTTPS origin after service creation | Next build and runtime | No | Voice/chat endpoint; origin only, without `/api` |
| `SUPABASE_URL` | Same Supabase project URL | Next server **and** Render SpeakWise environment; private local catalog operator environment | No | REST queries and access-token validation |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Settings → API Keys: dedicated secret key or legacy service-role key | Next server and private local catalog operator environment; **not** Python/browser | **Yes** | Privileged RPCs after verified user ownership; catalog maintenance |
| `SUPABASE_ANON_KEY` | Same publishable/anon key used above | Render SpeakWise required; Next optional because its public key is a fallback | No | Verify users through Supabase Auth without elevated access |
| `OPENAI_API_KEY` | OpenAI project's API Keys | Render SpeakWise only | **Yes** | Chat/feedback/summary and TTS requests |
| `OPENAI_CHAT_MODEL` | Model available to the OpenAI project | Render SpeakWise; default `gpt-4o-mini` | No | Text generation model |
| `OPENAI_TTS_MODEL` | Speech model available to the OpenAI project | Render SpeakWise; default `gpt-4o-mini-tts` | No | Voice generation model |
| `SPEAKWISE_CORS_ORIGINS` | Exact production Next/custom-domain origin(s) | Render SpeakWise | No | Comma-separated permitted browser origins; no paths, trailing slashes, or `*` |
| `YOUTUBE_API_KEY` | Google Cloud project with YouTube Data API v3 enabled | Next server and private local catalog operator environment | **Yes** | Official metadata, discovery and availability rechecks; restrict key to this API |
| `CRON_SECRET` | Password manager generated random secret, at least 32 characters | Next server; same value on Render cron **only if using step 10** | **Yes** | Authorize the scheduled maintenance route |
| `VIDMATCH_INGEST_TOKEN` | A separate generated random secret | Next server | **Yes** | Protect manual candidate-ingestion API; not required by the local catalog CLI |
| `PROJECTFLUENCE_URL` | Actual canonical Next HTTPS origin | Render cron only, step 10 | No | Destination of the scheduled HTTP request |
| `NODE_VERSION` | Repository `.node-version` (`22`) | Render Next and cron only | No | Render runtime selection; not a Vercel runtime switch |
| `NODE_ENV` | Literal `production` | Render Next; Vercel manages its production runtime | No | Production runtime behavior |
| `PORT` | Assigned automatically by Render | Render web services | No | Listening port used by both start commands; do not hard-code it |
| `PYTHON_VERSION` | Normally omit; committed `.python-version` selects `3.13` | Optional Render SpeakWise override only | No | If supplied, Render requires a full released patch version; remove old incomplete overrides |
| `SUPABASE_ACCESS_TOKEN` | Supabase account personal access tokens | Optional local/CI deployment secret, **not application runtime** | **Yes** | Noninteractive CLI login; unnecessary when using `supabase login` |
| Project reference / database password | Supabase project / creation credentials | CLI `link`/migration prompt or protected deployment CI | Password: **yes** | Select project and connect for migrations only |
| Site URL / Redirect URLs | Final Next origin and reset path in step 8 | Supabase Authentication → URL Configuration | No | Allowed hosted Auth destinations |
| SMTP credentials | Chosen production email provider | Supabase Authentication → SMTP settings | **Yes** | Confirmation and password-recovery delivery |
| Google OAuth client ID / secret | Google Cloud OAuth application, if Google sign-in is offered | Supabase Authentication → Google provider | Client secret: **yes** | Optional Google login |

Do not add a service-role/secret key to any `NEXT_PUBLIC_*` variable. Do not add `VIDMATCH_LEGACY_CATALOG=true` to the final production configuration: it bypasses the reviewed/active/fresh catalog filter. `NEXT_PUBLIC_API_URL` is an old fallback; use `NEXT_PUBLIC_SPEAKWISE_API_URL` explicitly.

For local development only, root `.env.local` may hold the Next values; `api/speakwise/.env` holds the Python values. Both are ignored by Git. For catalog commands, an ignored private `.env.local` needs only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `YOUTUBE_API_KEY`. Do not upload local env files as public assets. Changing a `NEXT_PUBLIC_*` value requires a new frontend build.

## 5. Create the SpeakWise Render service

Create a **Web Service**, connect the existing GitHub repository and reviewed branch, and enter:

| Setting | Exact value |
| --- | --- |
| Runtime | Python |
| Root Directory | `api/speakwise` |
| Python version | Committed `.python-version`: `3.13` |
| Region | `singapore`, matching `render.yaml` |
| Build Command | `python -m pip install -r requirements.txt` |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port $PORT --workers 1` |
| Health Check Path | `/health` |
| Instances | `1` |
| Persistent disk | None |
| Auto deploy | Off until first deployment validation is complete |

Set all Python variables from step 4. Render commands and version files are evaluated relative to the configured service root. `.python-version` permits a minor version, whereas a `PYTHON_VERSION` environment override requires a full patch version. [Render service roots](https://render.com/docs/monorepo-support), [Render Python versions](https://render.com/docs/python-version).

Keep one worker/instance because the current paid-request rate and concurrency limits are process-local. For responsive voice use an always-running service plan: Render's free service sleeps after inactivity, adding cold-start delay to the first conversation request. [Render free service behavior](https://render.com/docs/free).

Record the assigned HTTPS origin; do not assume the requested service name guarantees a particular hostname. Set it as `NEXT_PUBLIC_SPEAKWISE_API_URL` in Next. If the frontend origin is not assigned yet, finish the Render CORS value after step 7 and redeploy/restart Python before testing browser speech. Do not use a wildcard as a temporary substitute.

Check the public liveness URL:

```sh
curl --fail --show-error 'https://YOUR_ACTUAL_SPEAKWISE_HOST/health'
```

This check is free of database writes and billable model calls. It does not validate the OpenAI key or prove microphone/audio behavior.

## 6. Preserve and activate the reviewed VidMatch catalog

The database is the live catalog; `apps/vidmatch/catalog/reviews.json` is the repository's independent editorial evidence, not a database backup. The completed import left **490 catalog rows** and the repository contains **435 reviews**. Of those reviews, **434** match hosted rows; the older candidate `l_NYrWqUR40` remains absent because of its B2 channel cap.

After migration, **434 reviewed rows are eligible for activation before any new provider outages**. The **56 older unreviewed rows** and their learning history stay in the database, but they become hidden from recommendations. Do not expect 490 automatically visible videos. To restore an unreviewed row, supply an appropriate independent editorial review and complete normal approval; a health refresh alone cannot grant editorial approval. A code deployment does not run the activation command automatically.

After all four migrations, use the final reviewed manifest and the same Supabase project. The CLI's default `--target-per-level 30` is a **total target including existing rows**, not “add 30”; it is too small to recreate a larger catalog. For an expanded catalog, use the supported ceiling of 200 per level and inspect its actual selected/deferred results. This limit does not delete existing rows or require filling every level.

```sh
npm ci --include=dev
npm run vidmatch:catalog -- inspect --env-file .env.local --target-per-level 200 --report /tmp/vidmatch-deploy-preview.json
```

Review the report before writes. Import only the agreed manifest, then save the receipt outside Git:

```sh
npm run vidmatch:catalog -- import --env-file .env.local --target-per-level 200 --write --report /tmp/vidmatch-deploy-import.json
```

This leased, transactional command inserts eligible new videos and activates matching-level reviewed legacy rows without replacing learner history or existing editorial classifications. Conflicting legacy levels are reported, not silently overwritten. Re-running the same manifest/configuration is idempotent. A `partial` run is terminal for its run key; only if the report shows unfinished work, continue with a new unique key:

```sh
npm run vidmatch:catalog -- import --env-file .env.local --target-per-level 200 --run-key deployment-followup-YYYYMMDD-1 --write --report /tmp/vidmatch-deploy-followup.json
```

Use a fresh meaningful identifier in place of `YYYYMMDD-1`; do not endlessly retry rejection or activation conflicts. Do not use `--legacy-schema` after migrating. Normal API ingestion discovers candidates and does not replace this initial reviewed-manifest import.

Afterward, re-run the preflight counts and this read-only query:

```sql
select level, count(*) as total,
  count(*) filter (where availability_status = 'active'
    and editorial_reviewed_at is not null
    and provider_metadata_expires_at > now()) as visible_now
from public.vidmatch_videos
group by level order by level;
```

Compare with the final catalog handoff/receipt rather than an assumed quota. Preserved rows can correctly be hidden if they are unreviewed, unavailable, or expired. Investigate zero visible rows through migration/import/provider status; do not turn off the production filter to hide the problem.

## 7. Configure and deploy the Next.js Vercel project

Import the existing GitHub repository (or correct the existing failed Vercel project) using the reviewed branch/commit from step 1.

| Setting | Exact value |
| --- | --- |
| Framework Preset | Next.js |
| Root Directory | Repository root; leave empty or `.` in the UI, **not** `apps/`, `api/speakwise`, or the local worktree folder name |
| Install Command | `npm ci --include=dev` |
| Build Command | `npm run build` |
| Output Directory | Next.js default; no static `out` override |
| Start Command / Port | Managed by Vercel; do not configure Uvicorn or `next start` here |
| Application liveness URL | `/api/health` |
| Fluid Compute | Enabled; the catalog cron route exports `maxDuration = 300` |

The root build automatically runs the vocabulary data/image/ambiguity audits before `next build`, then generates sitemaps. Keep dev dependencies installed because TypeScript, build tooling and audit scripts need them. No Python install command belongs in this Vercel project.

**Node version:** select **22.x** in Vercel. The root `package.json` and lockfile pin `>=22.18 <23`, matching the Node 22 line used by local validation and Render. This matters because Vercel gives the package engine precedence over its dashboard setting; the previous broad range could select Node 24. Verify Node 22 in the first build log. `NODE_VERSION` is a Render setting, not a Vercel runtime switch. [Vercel Node version precedence](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

Add the Next Production variables from step 4 before building. Obtain the Vercel project's stable production domain or configured custom domain and use its HTTPS origin for `NEXT_PUBLIC_SITE_URL`. Use the Render URL from step 5 for `NEXT_PUBLIC_SPEAKWISE_API_URL`. If a first deployment was necessary to assign these URLs, update them and **rebuild** before the final smoke test; do not leave placeholder URLs in the browser bundle.

Vercel Fluid Compute supports the five-minute route budget, and the App Router's named `maxDuration` export is the supported configuration mechanism. Verify it in the project settings rather than inheriting a shorter limit from an old project. [Function duration](https://vercel.com/docs/functions/configuring-functions/duration), [Fluid Compute limits](https://vercel.com/docs/fluid-compute).

## 8. Finish production Auth and CORS settings

Now that both actual HTTPS origins exist:

1. In Supabase Authentication → URL Configuration, set **Site URL** to the canonical Next origin. Add that exact origin/root and `https://YOUR_FRONTEND/auth/reset-password` to **Redirect URLs**. Include both origin and trailing-slash root when entering the explicit list. The app returns signup/Google sign-in to the origin and recovery to `/auth/reset-password`; it does not require a Next `/auth/callback` route.
2. Enable Email signup/confirmation, configure production SMTP, and keep anonymous sign-in disabled. Test confirmation and recovery messages with an account you control.
3. If using the existing Google sign-in button, enable Google in Supabase and set its client ID/secret there. In Google Cloud, use the callback displayed by Supabase, ordinarily `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`; it is not the Vercel/Render frontend URL.
4. Set Render `SPEAKWISE_CORS_ORIGINS` to the exact canonical Next origin. If users intentionally visit both a custom domain and the provider domain, include both comma-separated. Apply the updated service environment.
5. Ensure Next's `NEXT_PUBLIC_SITE_URL`, Supabase Auth destinations, and the domain users actually visit agree. Rebuild Next if a public variable changed.

Use exact production redirect destinations; add development/preview origins only when actively needed. This app uses the explicit build-time site URL, so a preview built with the production site URL redirects Auth to production. [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

## 9. Enable exactly one catalog scheduler

For the primary Vercel deployment, keep `vercel.json`'s schedule `0 20 * * *`: the protected Next route runs daily at 20:00 UTC (05:00 JST the next day). Set `CRON_SECRET` on the production Vercel project before deploying. Vercel sends it as a Bearer authorization header automatically. Its Hobby daily schedule may run within the scheduled hour, so do not promise exact-minute execution. [Vercel cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [cron scheduling limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Do not also create the Render cron job for this topology. The route refreshes up to 50 oldest catalog entries per run, purges up to 20 batches of 50 expired provider snapshots within a bounded time budget, and discovers candidates. Discovery does not auto-approve unknown videos or restore missing editorial evidence. Provider metadata expires after 30 days; check the job's success and oldest-check age routinely. At catalog size N, uninterrupted full batches require roughly `ceil(N / 50)` daily runs for coverage; monitor actual progress and purge backlog rather than assuming this bound is met.

For an intentional one-off health refresh from an authorized private operator environment:

```sh
npm run vidmatch:catalog -- health --env-file .env.local --write --report /tmp/vidmatch-health.json
```

It checks one bounded batch, not the entire catalog. Do not repeatedly invoke it without looking at quota/failure reports. Missing/restricted videos are excluded; network/API failures do not count as confirmed deletion.

## 10. Alternative: host Next.js on Render too

If choosing all Render, import the checked-in `render.yaml` Blueprint for the reviewed branch. It creates **two Web Services and one Cron Job**; do not import the whole Blueprint just to host Python while keeping Next on Vercel. Keep automatic deploys off until migration, URL configuration and smoke checks are complete. Confirm any initial Blueprint deploy is using valid environment values before exposing traffic.

Python settings remain step 5. Configure the Next service and scheduler exactly as the Blueprint:

| Setting | `projectfluence-web` | `projectfluence-daily-youtube` |
| --- | --- | --- |
| Service type | Web Service | Cron Job |
| Runtime | Node, `NODE_VERSION=22` | Node, `NODE_VERSION=22` |
| Root Directory | Empty: repository root | Empty: repository root |
| Build Command | `npm ci --include=dev && npm run build` | `node --version` |
| Start Command | `npm run start -- --hostname 0.0.0.0 --port $PORT` | `node scripts/run-vidmatch-cron.mjs` |
| Health Check Path | `/api/health` | Not applicable |
| Schedule | Not applicable | `0 20 * * *` |
| Region | Singapore | Singapore |

Next requires a Web Service because it serves API routes; a Render Static Site is insufficient. Set the Next variables on `projectfluence-web`. Set `PROJECTFLUENCE_URL` to its actual canonical HTTPS origin on the cron job; Blueprint `fromService` shares the generated `CRON_SECRET`. No npm dependencies are needed for the cron's native-fetch script. `vercel.json` is inert when the app is hosted exclusively on Render. If a Vercel project also exists, disable its scheduler to avoid duplicate operation.

The Render Next service must listen on its assigned `$PORT`. Configure the two health paths so Render can test newly started instances. [Render health checks](https://render.com/docs/health-checks).

## 11. Run the production smoke checks

Use test accounts and record the deployed SHA, hosts, migration versions, catalog visible counts and results. Local mocked tests are useful but do not substitute for these hosted checks.

- [ ] `GET https://YOUR_FRONTEND/api/health` and `GET https://YOUR_SPEAKWISE_HOST/health` return 200.
- [ ] Sign up, receive confirmation, sign in, reload to keep the session, sign out, and recover the password. Test Google if configured. All callbacks return to the intended domain.
- [ ] Private learning routes reject a missing/expired bearer token. Two different test users cannot read or modify one another's progress/settings/history through direct requests.
- [ ] Complete a VocabStream meaning/sentence lesson; reload and see the same saved result. Image cards, review images and their attribution load. Existing idiom archive progress retains its identity.
- [ ] Start SpeakWise signed in; allow microphone access on HTTPS, recognize speech where the browser supports it, send a turn, see the response and hear AI speech. Test typed-input fallback, denied microphone permission, manual audio playback if autoplay is blocked, cancellation/new turns and saving the lesson summary.
- [ ] Inspect SpeakWise timing logs for LLM first token/total and TTS first byte/playback; confirm no CORS errors or request bodies/tokens/API keys in logs.
- [ ] Load VidMatch A1–C2 and topic filters; paginate beyond the first page with no duplicate/missing items. Verify the expanded catalog's expected eligible entries, thumbnail fallback and clear empty/error state.
- [ ] Open several VidMatch videos on current iPhone Safari, an iPad, Android Chrome, desktop Safari/Chrome/Edge; verify YouTube opens and plays. The app does not host its own video file or Supabase signed URL, so bucket/CORS/codec changes are not fixes for a YouTube availability restriction.
- [ ] Open a video signed in; verify history and analytics survive reload. Confirm no video rows/history were deleted during migration/import.
- [ ] Observe one successful production catalog cron run with authorization, no unexpected activation conflicts and bounded provider usage; investigate nonzero purge backlog/partial work.
- [ ] Check production browser console, Vercel/Render logs and Supabase logs for unexpected errors. Never paste secrets or private learner content into a bug report.

No Storage upload/signed-URL smoke test applies because these workflows do not use Supabase Storage. No live provider, hosted migration, production browser, or physical-device success is claimed merely by publishing this document.

## 12. Deployment ordering and recovery

The required order is:

**Reviewed Git commit available on the selected deployment branch → existing Supabase backup and four migrations → create Render voice service and obtain its URL → reviewed catalog activation/verification → build Next with real Supabase/voice/site URLs → finalize Supabase Auth and voice CORS → rebuild/redeploy any changed URL configuration → smoke checks → verify the single production scheduler.**

Catalog import can run before either host is live because it uses Supabase and YouTube directly. A first Next project deployment may be needed to assign its stable URL; it is only a bootstrap until the public variables, Auth redirects and CORS match. Voice CORS and Supabase Auth need the frontend origin; the browser's voice variable needs the Render origin; Render cron needs the frontend origin. There is no URL-dependent webhook to add beyond Auth redirects and the scheduler destination.

If a code deployment fails, keep or restore the last known-good **compatible** application revision and preserve Supabase data. Do not undo migrations by resetting the database or delete the catalog. Check the deployed SHA/root/exclusions for the Vercel requirements error, Python build logs for an incorrect version override, and migration/import status for empty VidMatch recommendations. A successful health check alone cannot rule out a bad API key, auth redirect, model permission, or stale catalog.
