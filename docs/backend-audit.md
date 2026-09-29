# Backend production-readiness audit

Audit date: 2026-09-29. Source inspection covered the Next application and all API routes, every app's frontend/service code, FastAPI, per-app SQL and existing transcript work, auth components, static-content loaders, scripts, deployment configuration, environment references, and reachable Git history. Findings were prioritized before implementation; no hosted database migration, paid AI call, or production deployment was performed.

## Architecture discovered

| Workflow | Request/data flow |
| --- | --- |
| Sign-up/sign-in/reset/Google | Shared `AuthButton` / reset page → singleton Supabase browser client → Supabase Auth → persisted/refreshed browser session → app state. Signup trigger creates `profiles`; Google callback is hosted by Supabase. |
| Protected data APIs | Browser bearer token → Next `getAuthenticatedUser` → Supabase `/auth/v1/user` → verified user UUID → owner-scoped REST/RPC with server secret key → JSON → UI. Public learning routes remain navigable; authorization is enforced at writes/reads. |
| Vocabulary lesson | Static `public/vocabstream/data` JSON → quiz state → bounded progress payload + stable attempt UUID → Next `/api/vocabstream/progress` → one PostgreSQL transaction for attempt/questions/progress/mistakes → saved/retry state. Guests practice without durable writes. |
| Weak-word review | Signed-in UI → Next `/api/vocabstream/review` → owned mistakes + process-shared local corpus read concurrently → generated practice questions → same progress transaction. Token refresh keeps active questions stable. |
| SpeakWise setup | Browser session → concurrent Next settings and learner-memory reads → owner-scoped Supabase data → bounded prompt-memory projection. Failed settings restoration never writes defaults over saved preferences. |
| SpeakWise turn | Browser Web Speech Recognition → editable text → **manual Send** → authenticated FastAPI `/api/chat` → bounded model prompt/history → async OpenAI text stream collected as JSON → immediate text display → `/api/voice` → OpenAI MP3 stream → browser MediaSource or same-download Blob fallback → playback. |
| SpeakWise persistence | Successful start → stable UUID session insert (idempotent) → lesson end → FastAPI summary → Next `/api/speakwise/learner-memory` → owned session check + atomic summary/mistake transaction → memory refresh. A failed refresh after commit does not turn a saved result into a reported failed save. |
| VidMatch | Filters → Next `/api/vidmatch/recommend` → filtered Supabase catalog → typed cards/CDN thumbnails → native YouTube watch link. Click → protected history API → catalog-backed increment RPC. Actual playback occurs on YouTube. |
| Video ingestion | Admin token or daily cron secret → Next route → YouTube Data API search/details → normalized/quality-filtered metadata → Supabase upsert. No video bytes are downloaded, transcoded, or stored. |
| Analytics | Browser token → Next `/api/analytics/summary` → one PostgreSQL JSON aggregation RPC → dashboard. Lifetime counts no longer stop at the REST default 1000 rows. |
| Transcript foundation | Existing uncommitted Stage 1 route/services accept authorized timestamped segments → normalize/chunk → atomic snapshot RPC. The root migration chain preserves this schema; the local-only route is not included in the audit commit. |

Runtime inventory:

- Next.js 15 App Router, React 18, TypeScript; all application APIs explicitly use Node runtime. No server actions or Edge/serverless-specific business logic were found. Next routes can be hosted by Vercel or a long-running Render Node service.
- FastAPI/Uvicorn for five paid AI endpoints; pooled async OpenAI/HTTPX clients, process-local rate/concurrency limits, request/model deadlines and structured stage logging.
- Supabase Auth/PostgreSQL: profiles; four VocabStream tables; four SpeakWise tables; VidMatch catalog/settings/history; transcript metadata/chunks (14 tables in canonical migrations). Privileged RPCs have restricted grants and fixed search paths.
- No application Supabase Storage buckets, signed media URLs, upload endpoint, Realtime subscriptions, Edge Functions, direct runtime database connection, SSE, WebSocket, persistent media disk or queue worker.
- The only scheduled job is daily YouTube ingestion. Caches are the static lesson files, reused provider connections, cached public YouTube metadata and a shared cold-start vocabulary catalog promise. Personalized data responses are not cached publicly.

## API inventory

| Runtime | Paths | Access |
| --- | --- | --- |
| Next | `/api/health` | Public liveness |
| Next | `/api/vidmatch/recommend` | Public, bounded validated filters/results |
| Next | `/api/vidmatch/ingest-youtube`, `/api/vidmatch/cron/daily-youtube` | Separate private admin/cron bearer secrets |
| Next | `/api/vidmatch/settings`, `/api/vidmatch/history` | Authenticated owner |
| Next | `/api/vocabstream/progress`, `/api/vocabstream/lesson-progress`, `/api/vocabstream/review` | Authenticated persistence; guest read paths return empty data |
| Next | `/api/speakwise/lesson-settings`, `/api/speakwise/lesson-sessions`, `/api/speakwise/learner-memory` | Authenticated writes; guest setup reads return empty data |
| Next | `/api/analytics/summary` | Authenticated owner |
| FastAPI | `/health` GET/HEAD | Public liveness |
| FastAPI | `/api/chat`, `/api/voice`, `/api/lesson-summary`, `/api/feedback`, `/api/improved-version` POST | Valid non-anonymous Supabase user + request budget |

## Prioritized findings and fixes

| Priority / consequence | Original finding | Implemented outcome |
| --- | --- | --- |
| P0 / cost abuse, availability | Paid FastAPI endpoints accepted unauthenticated unlimited input | Remote Supabase verification on every paid request, anonymous-account rejection, bounded bodies/fields, per-user 30/min and 300/hour, 2 concurrent/user and 24/instance; single-worker deployment documented |
| P0 / dependency security | Locked Next 15.5.15 and transitive image/CSS dependencies had critical/high advisories | Next 15.5.26, Sharp 0.35.5, aligned Next ESLint and compatible patched dependencies; PostCSS 8.5.28 override for Next's stale pin; final npm audit zero known findings |
| P0 / data integrity | VocabStream saved profile/attempt/progress/questions/counters separately; retries and concurrency could duplicate/partially save | Single transaction, stable request UUID + payload digest, advisory transaction lock and atomic upsert counters; failed late write rolls everything back |
| P0 / ownership, data integrity | SpeakWise accepted arbitrary foreign session IDs; summary and mistake increments were separate read/write operations | Owned-reference trigger + RPC session ownership check, transactional counters and one logical summary per session; historical duplicates preserved |
| P1 / responsiveness | Async FastAPI handlers called synchronous OpenAI SDK, blocking the event loop | Pooled async SDK and real streamed provider consumption; provider deadlines and no indiscriminate paid retries |
| P1 / perceived voice latency | Full TTS generation then full browser download before audio | Progressive continuous MP3 delivery and feature-detected browser buffering; automatic-play rejection gets a reusable manual-play action |
| P1 / state/media reliability | Stale audio/requests and token refresh could interfere with current lesson/preferences/review | Request cancellation/identity checks, cleanup, browser-compatible deadlines, account-bound state and settings restoration, preserved quiz on token refresh |
| P1 / VidMatch false failures | Filters ran after selecting the top 100 catalog rows; images had no useful failure state | Filters applied in SQL before limit, safe canonical links, bounded thumbnail fallback + retry, and typed metadata/error states |
| P1 / misleading history | History accepted client metadata and never incremented click counts reliably | Catalog-backed RPC increments atomically and ignores forged client URL/title/count/user fields |
| P2 / API reliability | No consistent deadlines, some DB reads failed silently, raw exceptions leaked, oversized inputs were accepted | Shared bounded fetch/JSON helpers, correct 400/401/403/413/429/503/504 distinctions, safe public errors/request IDs, no automatic write replay |
| P2 / scalability | Analytics silently truncated at REST's row cap; review cold-start work repeated | SQL aggregate RPC; parallel owned query/corpus loading and shared corpus promise; justified per-user query indexes |
| P2 / deployment | Fragmented manual SQL and incomplete Render runtime/env settings | Root CLI migration chain, two web services + equivalent cron Blueprint, health routes, exact env/deployment/smoke guides |
| P2 / modern Supabase setup | Direct REST calls treated all elevated keys as JWTs | New `sb_secret` keys use the API-key header; legacy JWT keys retain Bearer compatibility |

No matching OpenAI/private-key/Supabase-secret/JWT secret material was found in 2,445 reachable Git blobs checked by the pattern scan. Local `.env.local` and Python `.env` are ignored and were not printed/committed. This is a pattern scan, not proof that arbitrary credential formats never existed. Service-role credentials remain server-only. If an independent historical leak is identified, rotate its affected key; no specific leaked credential was established here.

## SpeakWise latency and quality

The original critical path included browser speech finalization/manual submission, auth-less API transport, synchronous full text generation, a second request, full TTS generation, full audio download, then playback. It was not a realtime speech-to-speech API. No server STT stage exists to measure.

The new path preserves the product's manual submission and one continuous utterance. Chat generation now records actual provider time to first token and total time without blocking other requests. Text is still returned as one JSON answer; TTS begins after that answer, not after the first token. TTS relays bytes as generated. MP3 MediaSource playback can begin before delivery completes; unsupported browsers use the same download as a Blob. There is no sentence segmentation, overlapping TTS queue, or added multi-call synthesis cost. Payload projections limit repeated learner-memory data.

Instrumentation distinguishes:

| Stage | Available evidence / limit |
| --- | --- |
| End of speech / final transcript | Browser recognition finalization event timing; not a precise voice-activity endpoint or server STT duration |
| Manual submission / response | Browser request duration and response arrival; manual waiting remains user-controlled |
| Backend receipt / request | Request ID, route, status, header duration and `Server-Timing`; browser/server clocks are not naively subtracted |
| LLM | Actual streamed first-content token and completion milliseconds |
| TTS request / first chunk / completion | Structured TTS timing and browser request/first-byte events; server chunk is 4096 bytes, so this is first delivered chunk rather than the provider's literal first network byte |
| Browser buffer/decode/playback | First-byte and `playing` events delimit buffering; they do not separately measure decoder internals or physical speaker output |

In a real local Chromium decoding test, synthetic MP3 bytes were deliberately delivered in chunks. `playing` fired approximately **1,897 ms before download completion**. This demonstrates removal of the full-download barrier under that fixture, not a measured OpenAI speedup or guarantee for Safari. Health remained responsive during a delayed mocked LLM request. No live paid provider benchmark was run.

Future changes worth evaluating separately: automatic turn detection, reliable streaming STT, first-sentence TTS while text is generated, or realtime speech-to-speech. Evaluate speech quality, interruption, browser support, privacy, cost and p50/p95 latency before selecting one. Do not promise realtime behavior from the current manual-send architecture.

## VidMatch reliability

The source does not contain a `<video>`, iframe player, signed media URL, application video file, media CDN proxy, or transcoder. Consequently MIME/codec/container, Range/206, video CORS, buffering/autoplay/playsinline settings are controlled by YouTube after navigating away; changing them here would invent a different product.

Demonstrated app-controlled problems were false empty results, missing thumbnail fallbacks, fragile metadata/links, stale requests, preference races and inaccurate history. Changes preserve native links (including mobile link opening), derive URLs from valid 11-character video IDs, constrain thumbnail URLs to YouTube's image hosts, prefer smaller thumbnails at ingestion, display actionable image failures, and exclude currently nonpublic/unprocessed/age-restricted metadata from new ingestion. Failure logs identify the thumbnail/load stage without user content.

The cause of historical device-specific video playback cannot be proven without the affected URL/device/network. Real current/older iPhones, iPads, Android devices and desktop browsers still need the deployment smoke matrix. Removed videos, later privacy/region/account restrictions, unavailable YouTube service, and external player behavior remain provider-side limits. No infinite retry or unnecessary video proxy was added.

## Database, RLS and migration details

The canonical `supabase/migrations` chain can initialize a clean database and adopt the checked-in prior schemas. It retains original data and transcript contents. It explicitly grants privileges, restricts elevated RPC execution to service role, fixes function search paths, verifies linked user ownership, and retains owner-read RLS. Ordinary browser roles cannot directly mutate learning records or execute another user's aggregate/save RPC. The profile update grant is limited to the user's own username/display name.

New indexes correspond to actual lesson list, weak-word ranking and summary-idempotency queries. Existing catalog array indexes can serve filters now that filtering occurs in PostgreSQL. Existing invalid historical scores are retained using `NOT VALID` constraints; new/updated records must satisfy them. Migration documentation includes an audit query before validating old rows.

No Storage/realtime resources need deployment. Per-app SQL remains as historical source, and must not be reapplied after hardening. Hosted manual schema/auth drift cannot be inferred from source and requires staging comparison. See [Supabase deployment and database checks](../supabase/README.md).

## Validation evidence and reproduction

Commands were run, not merely suggested:

- Final Node 22 validation passed: `npm run typecheck`, `npm run lint`, `npm test` (**37 tests: 4 existing learning + 33 boundary/media/progress tests**) and `npm run build`. The 8 preexisting local transcript tests also passed during implementation and remain outside the audit commit.
- **11 Python API tests passed** with both the existing environment and a clean disposable environment matching the fully constrained, audited dependency set. Cases include authentication on every paid route, bounds, safe errors, concurrency release, async responsiveness, stream-first delivery and disconnect cleanup.
- `scripts/validate-database.mjs`: **22 real PostgreSQL/WASM checks passed**, including legacy-data adoption, transactional rollback, retry identity, counts, RLS/grants, signup collisions, transcript replacement/failure preservation, linked ownership, and >1000 analytics. PGlite serializes connections; this is not a contention stress test or hosted Supabase test.
- `scripts/validate-api.mjs`: **8 actual Next HTTP integration groups passed** against an isolated local Supabase fixture, including owner identity, invalid/expired tokens versus outages, malformed/oversized payloads, idempotent session creation, summary ownership and successful-save/failed-refresh distinction.
- `npm run test:browser`: **14 routes across 10 viewport widths** passed with zero reported problems, page exceptions or accessibility violations; authentication dialog keyboard and validation checks passed.
- `scripts/validate-learning-saves.mjs`: production-browser fixture passed exact save retry identity, token-refresh quiz stability and no guest writes.
- `scripts/validate-speaking.mjs`: production-browser fixtures passed authenticated failures/retries, IME behavior, failed-settings preservation, summary persistence/retry, guest sign-in guidance, progressive real MP3 decoding, and 320–1920 layouts with zero accessibility violations/page exceptions.
- `scripts/validate-video.mjs` and `videoBrowser.test.mjs`: production-browser fixtures passed result/empty/error/retry, topic limits, safe links, thumbnail recovery/failure and responsive/accessibility checks.
- The exact staged source was exported without local `.env` or preexisting uncommitted files. A fresh `npm ci --include=dev`, production build, typecheck, lint, 37 JavaScript tests, 11 Python tests and 22 SQL checks passed in that isolated checkout.
- Render Blueprint passed the official JSON Schema with no errors. Both Next production startup and Uvicorn health/auth rejection were exercised locally with dummy service configuration.
- npm full dependency audit reported zero known vulnerabilities after patches. pip-audit reported zero known vulnerabilities in the constrained 27-package Python closure. These are point-in-time advisory checks.

Use disposable fixtures for local testing; never run the mutation smoke against a production Supabase URL. For the actual production checklist and each service/variable/deployment command, use [the deployment guide](production-deployment.md). The full Docker Supabase stack, hosted migrations, actual OAuth/email delivery, live paid AI, physical microphone/audio output and device-native YouTube playback were not certified locally.

## Remaining decisions and limits

- **Product decisions:** guest AI access/quotas, daily spending entitlement, automatic speaking turns, and whether to add an embedded video experience. Paid endpoints now require sign-in; browser-guest vocabulary remains available.
- **External configuration:** apply migrations; provision Auth/SMTP/Google, model/API access, production URLs, exact CORS and one scheduler; perform real two-account/device validation. Hosted state was not modified.
- **Future architecture:** distributed/durable quotas before scaling Python, realtime STT/speech quality evaluation, catalog revalidation for changed availability, and persistent observability aggregation if traffic warrants it.
- **Lower priority:** similar-video ranking still uses a bounded 200-item candidate pool; weak-word review is intentionally capped at 500; some compatible API errors retain only `{error}` while centralized failures add `code/requestId`; SpeakWise settings remain a byte-bounded JSON object rather than a versioned schema; progress validates internal scoring consistency but is not a server-authoritative exam/anti-cheat system.
- **Preexisting work:** the initial dirty transcript/IR planning files are preserved separately. They were inspected and their 8 tests passed, but their application endpoint is not being silently bundled into the audit commit. The copied SQL foundation is present in the canonical migration chain to preserve clean deployment compatibility with that work.

Primary technical references: [OpenAI streaming TTS](https://developers.openai.com/api/docs/guides/text-to-speech), [YouTube video metadata](https://developers.google.com/youtube/v3/docs/videos), [PostgREST filters](https://docs.postgrest.org/en/v14/references/api/tables_views.html), [Next security advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4), [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).
