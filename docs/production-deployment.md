# ProjectFluence production deployment

This guide deploys the repository's Next.js application/API, SpeakWise FastAPI service, and existing daily YouTube ingestion schedule to Render, with Supabase providing Auth/PostgreSQL. It does not claim those services have been deployed. Use the audited commit after the staging checks below.

## Services and exact commands

`render.yaml` defines the all-Render topology. Import it as a Blueprint connected to `dronerd/projectfluence`, selecting the reviewed branch/commit. Service names are labels; use the actual URLs Render assigns, not guessed `onrender.com` names.

| Service | Type/runtime | Root within Git repository | Install/build | Start | Port / health |
| --- | --- | --- | --- | --- | --- |
| `speakwise-backend` | Web / Python 3.13 (latest matching patch via `api/speakwise/.python-version`) | `api/speakwise` | `python -m pip install -r requirements.txt` | `uvicorn main:app --host 0.0.0.0 --port $PORT --workers 1` | Render `$PORT`; `/health` |
| `projectfluence-web` | Web / Node 22, at least 22.18 | Repository root (leave Root Directory empty) | `npm ci --include=dev && npm run build` | `npm run start -- --hostname 0.0.0.0 --port $PORT` | Render `$PORT`; `/api/health` |
| `projectfluence-daily-youtube` | Cron / Node 22 | Repository root | `node --version` (no packages required) | `node scripts/run-vidmatch-cron.mjs` | No listening port; `0 20 * * *` UTC (05:00 JST) |

The checkout folder is named `projectfluence`, but **do not** set the Next service Root Directory to `projectfluence`: `package.json` is already at the Git root. Next.js must be a web service because it executes authenticated API routes and reads the vocabulary corpus from disk. A static export cannot serve this application.

The Python service must remain **one worker and one instance**, including no autoscaling, while rate/concurrency limits are process-local. The Blueprint fixes this. Select an always-running web-service plan for interactive voice; a sleeping instance adds cold-start latency before any AI work. No persistent disk, Render PostgreSQL instance, Redis instance, background worker, media transcoder, or WebSocket service is required by this implementation. Cron invokes the existing protected HTTP endpoint once; it does not retry uncertain writes.

Automatic deploy triggers are off in the Blueprint to allow migration/configuration ordering. Reenable them after the first successful production validation if desired. On an existing Python service, remove the old `PYTHON_VERSION=3.11` environment entry: it is incomplete and overrides `.python-version`. A fully qualified, current Python 3.13 patch can be used as an explicit override instead.

If retaining the existing **Vercel frontend + Render Python** topology, create or update the Python web service using the settings above and place every Next variable below in Vercel. Importing the full Blueprint provisions all three services; it is not a Python-only deployment. Keep `vercel.json` for the existing daily schedule and set `CRON_SECRET` there. Do not run the Render cron as well. There is no requirement to move the frontend merely to use the backend improvements. On Render, Vercel-specific Analytics is disabled; application timing/error logs remain available.

For Vercel, keep Framework Preset **Next.js** and Root Directory at the Git repository root. The root `.vercelignore` excludes only `api/speakwise/`, which is the Render-only Python service; the Next route handlers in `app/api/` remain included. Without this exclusion, Vercel detects `api/speakwise/main.py` as an additional Python function and its requirements parser rejects the `-c constraints.txt` directive. The requirements and constraints files are valid for pip and must remain available to Render. Do not remove the dependency constraints or exclude `app/api/` to work around this build error. After changing this deployment boundary, deploy the updated Git commit rather than retrying the older failed revision.

## Variables and ownership

Use dashboard secret fields, never source-controlled `.env` files. The variable names retain compatibility with the existing app; the values can be current Supabase publishable/secret keys. Modern server secret keys are sent in `apikey`, not misrepresented as user JWTs; legacy service-role JWTs remain supported.

| Variable | Where to obtain it | Render/Supabase location | Secret? | Purpose |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project Connect/API settings | Next **build and runtime** | No | Browser Auth project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase API Keys: publishable key or legacy anon key | Next **build and runtime** | No | Browser Supabase client; private rows remain RLS protected |
| `NEXT_PUBLIC_SPEAKWISE_API_URL` | Python web service's assigned HTTPS URL | Next **build and runtime** | No | Browser calls FastAPI directly; origin only, no `/api` suffix |
| `NEXT_PUBLIC_SITE_URL` | Next web service's assigned/custom HTTPS origin | Next **build and runtime** | No | Signup/OAuth return URL, password-reset URL, metadata and sitemap |
| `SUPABASE_URL` | Same Supabase project URL | Next server **and** Python server | No | Database REST / server token verification |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase API Keys: dedicated secret key or legacy service-role JWT | **Next server only** | **Yes** | Privileged DB access after user verification; never public/build client code |
| `SUPABASE_ANON_KEY` | Same publishable/anon key used by the browser | **Python server**; optional on Next | No | Verify user access tokens with Supabase Auth; Python needs no service-role key |
| `OPENAI_API_KEY` | OpenAI project API keys with funded/enabled model access | **Python server only** | **Yes** | Chat, summaries, feedback and TTS |
| `OPENAI_CHAT_MODEL` | Model enabled on that OpenAI project | Python server; Blueprint default `gpt-4o-mini` | No | Chat Completions model |
| `OPENAI_TTS_MODEL` | Speech model enabled on that OpenAI project | Python server; default `gpt-4o-mini-tts` | No | Continuous MP3 speech generation |
| `SPEAKWISE_CORS_ORIGINS` | Exact frontend origin(s) | **Python server** | No | Comma-separated HTTPS origins, no paths, wildcards, or trailing slash |
| `YOUTUBE_API_KEY` | Google Cloud project with YouTube Data API v3 enabled | **Next server only** | **Yes** | Admin/daily video metadata ingestion; restrict the key to that API |
| `VIDMATCH_INGEST_TOKEN` | Blueprint generates a random value, or generate a separate random secret | **Next server only** | **Yes** | Bearer token for administrative ingestion; never ship to UI |
| `CRON_SECRET` | Blueprint generates a random value | Next server; cron references the same env value with `fromService` | **Yes** | Protect `/api/vidmatch/cron/daily-youtube` |
| `PROJECTFLUENCE_URL` | Actual Next production HTTPS origin | **Render cron only** | No | Scheduled HTTP ingestion target |
| `NODE_VERSION` | Blueprint value `22` | Next and cron | No | Node runtime; `.node-version` also records 22 |
| `NODE_ENV` | Blueprint value `production` | Next | No | Production runtime; build explicitly includes dev tool dependencies |
| `PORT` | Assigned automatically by Render | Each web service | No | Bind to Render's ingress port; do not hard-code 3000/8000 |
| `SUPABASE_ACCESS_TOKEN` | Supabase account access tokens, if automating CLI login | Deployment CI/local CLI only | **Yes** | Optional alternative to `supabase login`; not an app runtime secret |
| Supabase database password | Project creation/Database Settings | CLI prompt or deployment secret only | **Yes** | Migration connection; no runtime `DATABASE_URL` is needed |
| Google OAuth client ID/secret | Google Cloud OAuth client | **Supabase Auth → Google provider** | Secret for client secret | Existing Google sign-in button |
| SMTP credentials | Production mail provider | **Supabase Auth → SMTP** | **Yes** | Confirmation and password-reset delivery |
| Site URL / Redirect URLs | Final frontend origin | **Supabase Auth → URL Configuration** | No | Allow signup, OAuth and password-recovery redirects |

There is no STT API key: recognition uses the browser's Web Speech implementation. There are no Edge Function secrets or Storage bucket variables. `NEXT_PUBLIC_API_URL` is only a deprecated SpeakWise fallback; set `NEXT_PUBLIC_SPEAKWISE_API_URL` explicitly and leave the fallback unset. `VERCEL` is provider-supplied only when hosting Next on Vercel, and controls the optional Vercel Analytics component.

For local development, use ignored root `.env.local` for Next and ignored `api/speakwise/.env` for Python. Set the browser API to `http://127.0.0.1:8000`, frontend origin to `http://localhost:3000`, and Python CORS to the localhost/127.0.0.1 origins actually used. `npm run dev:speakwise` and `npm run dev:speakwise-api` run the two services. Test variables such as `FLUENCE_BASE_URL`, `FLUENCE_BROWSER_TOOLS`, `FLUENCE_TEST_SUPABASE_URL`/`FLUENCE_SUPABASE_URL`, `FLUENCE_AUDIO_FIXTURE_URL`, and `PGLITE_MODULE` are local validation only, not production secrets.

`NEXT_PUBLIC_*` values are embedded during `npm run build`. Changing them in Render requires a new build/deploy; restarting the existing process is insufficient. The same Supabase project must be used in the browser, Next, and Python environments.

## Deployment sequence

1. **GitHub:** publish/review the audit branch. Keep production auto-deploy paused while applying schema/config changes. Do not merge into a production auto-deploy branch until steps 2–4 are ready. Existing uncommitted transcript/IR work is separate from the audit commit.
2. **Supabase:** create/select the project, take a backup for an existing project, and test the root migration chain against staging. From the Git root:

   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push --dry-run
   npx supabase db push
   npx supabase migration list
   ```

   The three root migrations provision tables, indexes, RLS, grants, triggers, transcript storage and transaction functions. Do not rerun per-app schema snapshots afterward. Existing per-app installations can adopt the idempotent baseline; undocumented schema drift must be reviewed. No production reset or blanket migration repair is needed. Details, preserved legacy-row constraints, and local SQL tests are in [the Supabase guide](../supabase/README.md).
3. **Supabase Auth, once in dashboard:** enable Email and confirmation, configure SMTP, keep anonymous Auth disabled, and enable/configure Google if offering Google sign-in. Google Cloud's authorized redirect URI is the callback shown by Supabase, normally `https://PROJECT_REF.supabase.co/auth/v1/callback`. OAuth credentials belong in Supabase, not Render. `db push` does not apply hosted Auth settings from local `config.toml`.
4. **Reserve/create Render services:** connect the reviewed branch/Blueprint and read both assigned web-service URLs. Enter the variable table values. `NEXT_PUBLIC_SPEAKWISE_API_URL` cannot be finalized until the Python URL exists. `NEXT_PUBLIC_SITE_URL`, cron `PROJECTFLUENCE_URL`, and Python `SPEAKWISE_CORS_ORIGINS` cannot be finalized until the Next URL/custom domain is known. There is a URL-configuration dependency in both directions, not an application runtime circular dependency. Do not publish placeholder origins.
5. **Deploy Python:** after Supabase Auth/project keys exist, deploy `speakwise-backend`. Confirm `/health` returns 200. Confirm missing/invalid bearer tokens get 401 on paid routes. Health is liveness, not a paid-provider or database readiness probe. Keep one worker/instance.
6. **Finalize hosted auth redirects:** set Supabase Site URL to the frontend HTTPS origin. Add exact frontend root and `/auth/reset-password` URLs to the redirect allowlist. Include both apex/`www` origins only if both are actually used. No Next `/auth/callback` route is required: the Supabase browser client handles the return session.
7. **Build/deploy Next:** after migrations and production frontend variables are ready, run the Blueprint build/start commands. Confirm `/api/health`, then sign in and test one owned database read/write. API access is verified server-side even though public learning screens themselves are navigable without sign-in. SpeakWise paid practice and durable progress saves require a signed-in account.
8. **Populate VidMatch / enable exactly one scheduler:** with YouTube API enabled and tokens set, ingest an initial catalog (migrations intentionally contain no fabricated videos):

   ```sh
   curl --fail-with-body -X POST "$PROJECTFLUENCE_URL/api/vidmatch/ingest-youtube" \
     -H "Authorization: Bearer $VIDMATCH_INGEST_TOKEN" \
     -H 'Content-Type: application/json' \
     --data '{"query":"English listening practice travel B1","level":"B1","skills":["listening"],"topics":["travel"],"maxResults":10,"minQualityScore":70}'
   ```

   Use locally supplied secret environment values; never paste them into docs or logs. Run the Render cron manually once and check its success log. If migrating from Vercel, disable the Vercel schedule before enabling Render cron. On-demand ingestion still uses the separate ingest token. The transcript tables are ready, but the preexisting local-only Stage 1 ingestion route must be separately reviewed/committed before relying on that endpoint in deployment.
9. **Production validation:** run the checklist below on the actual domain and devices. Only then merge/enable normal auto-deploy and direct users to the release. Existing migrations are additive and preserve historical data; roll back application code if needed without dropping those tables.

No Supabase Storage bucket creation, Storage policies, file uploads, Edge Function deployment, realtime publication, database webhook or persistent-media-volume step is applicable. VidMatch opens YouTube; SpeakWise streams disposable audio from FastAPI. Browser-to-Next is same-origin. Browser-to-Python uses the CORS allowlist and bearer token. Do not add wildcard CORS or proxy video bytes through Next to troubleshoot external playback.

## Production smoke checklist

Use two ordinary test accounts A/B and an unauthenticated browser. Keep a record of actual device/browser versions and request IDs.

- [ ] Sign up, receive confirmation, open its allowed redirect, sign in, reload, and confirm session persistence.
- [ ] Sign out and confirm the UI clears its session and private screens show sign-in guidance. Missing/invalid/expired bearer tokens must be rejected by private writes and paid AI. Supabase controls the remaining lifetime of an already issued JWT; logout is not a claim of instant global JWT revocation.
- [ ] Complete password reset at `/auth/reset-password`; test Google OAuth if configured. No redirect to localhost/stale Vercel origin.
- [ ] A completes a vocabulary lesson; reload and see the score/review data. Retry a save after a lost response: no duplicate attempt or inflated mistake counter. Guest practice remains usable and makes no durable write.
- [ ] B cannot read A's private rows through direct Supabase requests. Browser anon/authenticated roles cannot invoke privileged save/analytics RPCs or insert/update/delete learning tables. B cannot attach a SpeakWise summary to A's session.
- [ ] Start SpeakWise signed in. Grant microphone permission on HTTPS; test denial/unavailable recognition and typed input. Confirm recognized words remain editable and manual Send works.
- [ ] Receive chat text, play AI audio, replay manually if autoplay is blocked, interrupt by starting input/end lesson, and verify no overlapping/late audio. Test a phone as well as desktop.
- [ ] Correlate server `llm_complete`, `tts_first_byte`, `tts_closed` logs with browser `speakwise_timing`; capture first-token, total-text, first-audio-byte and `playing` timings. Compare p50/p95 under real network conditions before claiming a latency improvement.
- [ ] Finish the lesson, see a valid summary, save/retry it, and reload learner memory. Database refresh failure after commit must not be reported as lost data.
- [ ] VidMatch returns a populated matching catalog; filters work even for videos outside the former first 100 rows. Empty results and backend failure are distinct.
- [ ] Block the thumbnail CDN to verify fallback/error/manual retry, then restore it. Open a canonical YouTube link; verify playback on current iPhone Safari, smaller/older supported iPhone, iPad, Android Chrome, macOS Safari/Chrome, Windows Chrome/Edge.
- [ ] Record provider-side failures separately: removed, private, regional or age-restricted video; account restriction; offline network. The app cannot inspect/control playback inside YouTube.
- [ ] Reopen history after clicking a catalog video; check accurate click counts and consistent metadata. Confirm changing accounts clears the previous account's history/preferences.
- [ ] Simulate expired session, offline network, provider 429/timeout, invalid request and failed DB write. UI exits loading, preserves answers, explains retry/sign-in, and does not expose internal error text.
- [ ] Check Render Next, Python and cron logs plus browser console/network for unexpected errors. No passwords, access tokens, API keys, transcript bodies or full user content in diagnostic logs. No Vercel-only analytics 404 on Render.
- [ ] Confirm no Storage bucket dependency was introduced; database and external YouTube/OpenAI delivery are healthy. Scheduled ingestion runs exactly once daily.

## Operational limits and follow-up

Authentication and per-user limits close anonymous paid API abuse, but creating many legitimate accounts can still incur cost. Configure provider project spending alerts, Supabase signup protections, and product quotas appropriate to expected usage. A durable shared rate/quota store is required before multiple Python workers/instances. These are deployment/product decisions, not implemented billing or entitlement systems.

The current browser speech recognizer is device/provider dependent, and text still completes before one TTS utterance starts. Streaming STT/automatic turn detection and sentence-level/realtime speech are future architecture work. Browser `playing` is not a physical speaker measurement. Real mobile hardware and production provider latency were not certified by local fixture tests.

Supabase hosted Auth/SMTP/Google, actual RLS deployment, real paid AI calls, real YouTube availability, and Render startup must be validated after service configuration. The SQL suite uses real PostgreSQL/WASM with modeled Supabase roles; it does not replace a full local Supabase stack or hosted two-user test.

Provider references: [Render Next web services](https://render.com/docs/deploy-nextjs-app), [Blueprint schema](https://render.com/docs/blueprint-spec), [Python runtime versions](https://render.com/docs/python-version), [cron jobs](https://render.com/docs/cronjobs), [Supabase migration workflow](https://supabase.com/docs/guides/deployment/database-migrations), [Supabase Auth redirects](https://supabase.com/docs/guides/auth/redirect-urls), [Supabase API-key formats](https://supabase.com/docs/guides/getting-started/api-keys).
