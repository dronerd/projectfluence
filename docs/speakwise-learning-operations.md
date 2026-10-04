# SpeakWise learning: setup and verification receipt

Implementation date: 2026-10-01. This is a local engineering receipt, **not a production rollout or a claim of improved learning outcomes**. No hosted migration, deployment, catalog mutation, or production learner-data write was performed.

Read the [capability audit](speakwise-learning-audit.md), [prompt audit](speakwise-prompt-audit.md), [data and migration runbook](speakwise-learning-data.md), [UI guide](../apps/speakwise/README.md), and [Python API guide](../api/speakwise/README.md) together.

## Runtime and data boundaries

| Component | Responsibility | Host |
| --- | --- | --- |
| Next.js application/API | Authenticated session lifecycle, confirmed preferences, catalog search/selection, canonical vocabulary cards and shared attempt transactions | Existing Vercel project |
| SpeakWise FastAPI | Bounded native PDF extraction, page/chunk retrieval, coverage-aware source context, validated model replies/actions, saved script generation, existing streamed TTS | Existing Render Python service |
| Supabase Auth/PostgreSQL | One shared identity and persistence system; existing vocabulary/catalog records plus additive private SpeakWise evidence | Existing Supabase project |

No vector database, agent framework, new paid service, OCR service, object-storage bucket, or replacement learner-progress store is introduced. The isolated test adapter is never a production runtime dependency. The only VocabStream runtime change exports its existing catalog loader; standalone lesson formats and reviewed content are preserved. Existing VidMatch curation/transcript schemas and availability filtering are reused.

## Setup and staged rollout

1. Use Node **22.18–22.x**, the committed lockfile (`npm ci`), and Python **3.13**. Install Python with `api/speakwise/.venv/bin/python -m pip install -r api/speakwise/requirements.txt`. The existing constraints file pins pypdf 6.19.0.
2. Review the five root migrations in filename order. The new migration is [`20261001000100_speakwise_learning.sql`](../supabase/migrations/20261001000100_speakwise_learning.sql). Take an existing-project backup and verify on staging before an authorized hosted application. The [data runbook](speakwise-learning-data.md) gives dry-run, apply, ownership checks, compatibility, and recovery instructions. Do not run app-local schema snapshots or a hosted reset.
3. Use the same Supabase project in all three runtimes. Next build/browser: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SPEAKWISE_API_URL` (Render origin), and the existing `NEXT_PUBLIC_SITE_URL`. Next server: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Python: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `OPENAI_API_KEY`, exact `SPEAKWISE_CORS_ORIGINS`; optional `OPENAI_CHAT_MODEL`, `OPENAI_REALTIME_MODEL`, and `OPENAI_TRANSCRIBE_MODEL` settings. Never put the service credential in Python or a public variable. Rebuild Next when public values change.
4. Keep `.vercelignore` excluding `/api/speakwise/` while including `app/api/`. `next.config.ts` includes the canonical vocabulary JSON in traced SpeakWise/review functions. Python retains one worker/instance while bounds are process-local. Do not move PDF extraction into Vercel functions or deploy the full alternative Render Blueprint.
5. After the schema is ready, deploy reviewed Python and Next revisions to staging. Keep production promotion separate. Do not expose the new UI against the old schema: missing tables/RPCs produce honest failures but cannot save a lesson.
6. Review/import text content into `vidmatch_text_content` with stable URLs, type, extracted body, source, language, and level using the existing server/admin boundary. **The migration deliberately contains no article seeds.** This task does not install a crawler or grant the model arbitrary URL fetching/catalog writes. Existing reviewed video catalog entries remain available; transcript metadata alone is not a usable transcript.
7. Run the live acceptance checks below. Roll back application revisions if necessary; retain additive evidence tables and backups. Do not drop populated new tables as a routine rollback.

## Product behavior and limits

- Upload goes directly to authenticated Python as PDF bytes; ownership is bound to the verified JWT. Original PDF bytes are discarded after native extraction; private extracted page text and structured warnings persist. Limits: 8 MiB input, 80 pages, 180,000 extracted characters, 24,000 per page; worker limits include 18 s wall time, 15 s CPU, Linux 256 MiB, and one extraction at a time. Busy/oversize/bad/encrypted/scanned documents have distinct actionable failures or unreadable statuses. No OCR is configured; figures/tables are not visually interpreted.
- Focused source retrieval searches chunks across every readable page. Whole-document context checks complete coverage: small documents use all passages; longer ones map every passage in bounded batches before synthesis. Coverage gaps and unreadable pages remain explicit. Provider-generated citation IDs must match selected source references. Quotes are literal extracted text; adaptations and original scripts have separate labels. Native extraction can still lose layout/reading order.
- Saved scripts include source references, language/level, requested length, selected words, generator version, and questions. Page/script text supports bounded speech sections and existing audio playback. Open-ended comprehension answers are persisted **unscored** and shown with a reference answer; neither submission nor seeing feedback proves comprehension.
- Catalog cards use actual metadata/body/transcript rows. Metadata-only videos can be opened but cannot support detailed transcript-based claims/scripts. Impression, resource selection/opening, self-reported activity, and scored vocabulary are different events. Unavailable playback remains a source-provider limitation; no YouTube bytes are proxied.
- Canonical vocabulary attempts use existing VocabStream progress evidence and reviewed answer policy, including available licensed images. A reveal/hint is not mastery. A few correct attempts reduce review urgency rather than declaring permanent mastery. Uncatalogued vocabulary is learner-confirmed private material, without automatic shared catalog insertion or fabricated multiple-choice questions. Historical records can lack hint/sense provenance; uncertainty must remain visible.
- Lesson messages and state save during the lesson, with retry IDs and source context. Recovery fetches authoritative records across pages. Completion derives a deterministic, versioned evidence summary and commits once; it does not depend on a successful extra model call or trust a browser-authored summary. Interrupted sessions remain resumable/provisional. Stored inferred observations require exact learner-message evidence, but are still model inferences.
- Confirmed profile values persist until edited. Task-aware memory combines owned full-corpus lexical candidates, recent events, source-category vocabulary outcomes, confidence and recovery; source retrieval is separate. Context is bounded and deduplicated. No semantic/vector retrieval is claimed. Memory controls edit confirmed preferences, inspect evidence, disable personalization, reset derived memory, or delete SpeakWise artifacts. Individual inferred evidence cannot yet be edited separately. Reset preserves canonical cross-app progress and session header analytics; it is not account erasure.
- Single-tab writes are serialized; simultaneous tabs can still overwrite mutable settings/session state. Immutable messages and attempts have database retry/ownership protections. Multi-connection hosted concurrency is a separate check. Older session headers have no fabricated transcripts and should not be interpreted as completed/recoverable conversations.

## Reproduce isolated verification

Tests below use synthetic learners/documents/catalog and deterministic external replies. They make no hosted Auth/OpenAI calls. Browser/HTTP validators reject non-loopback service origins. Never run the fixture server with production credentials.

```sh
npm test
npm run lint
npm run typecheck
npm run test:speakwise-api

# Temporary tools, outside the repository (Chrome installed locally):
npm install --prefix /tmp/fluence-learning-tools --no-save \
  @electric-sql/pglite@0.5.8 playwright@1.63.0 @axe-core/playwright@4.13.0
export PGLITE_MODULE=/tmp/fluence-learning-tools/node_modules/@electric-sql/pglite/dist/index.js
export FLUENCE_BROWSER_TOOLS=/tmp/fluence-learning-tools
node scripts/validate-database.mjs
npm run test:speakwise:sql
npm run eval:speakwise -- /tmp/speakwise-retrieval-results.json
api/speakwise/.venv/bin/python api/speakwise/tests/evaluate_sources.py
```

Start the following in separate local terminals:

```sh
# Terminal A: disposable in-memory SQL; real migrations, synthetic HTTP adapters
PGLITE_MODULE=/tmp/fluence-learning-tools/node_modules/@electric-sql/pglite/dist/index.js \
  node scripts/speakwise-fixture-server.mjs

# Terminal B: actual Python API
SUPABASE_URL=http://127.0.0.1:3103 SUPABASE_ANON_KEY=fixture-anon \
OPENAI_API_KEY=fixture-provider OPENAI_BASE_URL=http://127.0.0.1:3103/openai/v1 \
SPEAKWISE_CORS_ORIGINS=http://127.0.0.1:3102 \
  api/speakwise/.venv/bin/uvicorn main:app --app-dir api/speakwise --host 127.0.0.1 --port 8100

# Terminal C: actual production Next build, entirely dummy environment
export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3103
export NEXT_PUBLIC_SUPABASE_ANON_KEY=fixture-anon
export NEXT_PUBLIC_SPEAKWISE_API_URL=http://127.0.0.1:8100
export SUPABASE_URL=http://127.0.0.1:3103
export SUPABASE_ANON_KEY=fixture-anon
export SUPABASE_SERVICE_ROLE_KEY=fixture-service
npm run build
npm run start -- --hostname 127.0.0.1 --port 3102

# Terminal D: run serially; browser suite resets only its isolated fixture learner
export FLUENCE_BASE_URL=http://127.0.0.1:3102
export FLUENCE_BROWSER_TOOLS=/tmp/fluence-learning-tools
npm run test:speakwise:workflows
npm run test:speakwise:browser
```

`OPENAI_BASE_URL` above is only for the local deterministic test adapter, not a deployment setting recommendation. The adapter executes real SQL with role/JWT fixtures but is not hosted PostgREST/Auth. Real OpenAI grounding, language quality, output distributions, costs, and first-audible latency are not proven by fixtures.

## Obtained results

Environment: macOS 26.6.2 arm64, Node 22.18.0, Python 3.13.0, Chrome desktop automation, PGlite 0.5.8 in-memory PostgreSQL/WASM. Details and final browser receipt are in [validation artifacts](speakwise-validation/).

| Check | Result |
| --- | --- |
| Production build, TypeScript and ESLint | Pass |
| Existing frontend regressions | 27 pass |
| Backend/shared-contract regressions, including new learning policy | 100 pass |
| Python contracts/security/voice/document/action tests | 31 pass |
| Existing complete migration/database regressions | 27 pass |
| New SpeakWise SQL lifecycle/RLS/attempt/retrieval/reset scenarios | 12 pass |
| Actual local Next → Python → SQL HTTP scenarios | 9 pass; final-page PDF, whole coverage, script reopen, catalog/transcript absence, shared attempts, ownership and idempotent completion |
| Browser learning workflows | 14 checks pass, 52 API requests, zero runtime errors; six activity states × eleven viewports, zero Axe violations, refresh, reduced-height input, lost-response recovery, persisted language and derived-script deletion |

Synthetic retrieval comparisons use frozen-time labels, excluding future evidence; the corpus is far too small to establish learning efficacy:

| Evaluation | Labels | Baseline Recall@3 / nDCG@3 | Implemented Recall@3 / nDCG@3 |
| --- | --- | --- | --- |
| Learner memory | 5 tasks: older relevant, hard vocabulary, recovery, sparse, historical cutoff | 0.40 / 0.318 | 1.00 / 1.00 |
| Catalog text SQL candidates | 3 relevant tasks + 1 correct empty-result task | 0.00 / 0.00 | 1.00 / 1.00 |
| PDF source passages | 8 queries, 12 synthetic pages; initial 6,000-character baseline | 0.25 / 0.25 | 1.00 / 0.954 |

Warm microbenchmarks: catalog SQL median 0.489 ms, p95 1.390 ms over 100 calls; memory reranking median 0.004 ms, p95 0.005 ms over 500 calls. PDF ranking averaged 0.555 ms across 200 calls. These exclude network/auth/provider overhead and do not add relevance samples. Selected synthetic memory context was 31–118 characters; PDF mean was 3,339 characters. Token usage was **not** measured with a provider tokenizer. HTTP timing samples include actual local extraction/application work but synthetic auth/model replies; they are not live response-latency estimates. Machine-readable reports retain case labels, selected IDs, environments and limitations.

## Remaining live acceptance

Use a staging project and two ordinary test accounts after authorization/configuration. Verify actual PostgREST composite/JSON responses and RLS, simultaneous completion/reset/attempt writes, signup/refresh-token recovery, real multi-page and scanned PDFs under Render limits, source-injection attempts against the selected model, level/language/script fidelity, and provider failure/retry behavior. Populate reviewed articles and usable transcripts before claiming broad text/video content coverage. Test audio/recognition/autoplay and embedded/source playback on physical iPhone/iPad/Android and supported Safari/Chrome/Edge. The reduced viewport test emulates available keyboard space; it is not a physical virtual-keyboard or microphone test. Measure conversational and first-audible p50/p95 with stated sample sizes on that staging topology before claiming latency improvement.


## Realtime voice migration (2026-10-04)

On Render set `OPENAI_CHAT_MODEL=gpt-6-luna`, `OPENAI_REALTIME_MODEL=gpt-realtime-2.1-mini`,
and `OPENAI_TRANSCRIBE_MODEL=gpt-transcribe`. Remove the retired `OPENAI_TTS_MODEL` setting.
Existing environment overrides win over code defaults, so update any old chat model value too.
Install the updated Python requirements and deploy the Python and frontend changes together.
The same server-only `OPENAI_API_KEY` and Supabase configuration are used; no new database
migration or public OpenAI key is needed. Keep the single worker/instance deployment.

The learner starts a lesson and selects **音声で会話する** to grant microphone access.
Speech is sent directly to OpenAI over WebRTC; voice activity detection ends turns and
allows interruption. Mute pauses microphone transmission. Typed messages can join the
voice conversation while the AI is listening. **音声会話を終了** releases the microphone
and returns to typed Luna tutoring. Read-aloud buttons still work without a microphone,
using Realtime-generated WAV audio with replay controls. Unsupported saved voices fall
back to Alloy; the voice picker now lists Realtime-compatible voices.

The authenticated Python signaling endpoint retrieves the owned lesson, recent messages,
and learner memory. It keeps credentials on the server. Voice connections have one active
call per learner, a global limit of 24, and a deadline of the remaining lesson time or
20 minutes (whichever is shorter). These are process-local controls. Microphone tracks
and peer connections close on stop, errors, identity change and navigation. The server
also ends registered calls at their deadline and during graceful shutdown. Reconnecting
replaces only the caller’s previous connection, including stale registrations after a tab closes.

Final transcripts are saved through the existing lesson-state API, marked with speech or
typed input. Out-of-order transcription events wait for earlier turns before persistence;
failed saves keep the message for retry. Unfinished microphone transcription at disconnect
is discarded with an explicit notice. Transcripts are approximate evidence, not acoustic
or pronunciation scores. A generated assistant transcript may include speech interrupted
before playback finished. Voice mode has no source-retrieval or learning-action tools;
PDF questions and saved learning activities continue through the existing typed/material
controls. No source-reading or completed-action claims are made by the voice prompt.

Validation commands (with the isolated fixture stack above):

```sh
npm run test:backend
npm run test:speakwise-api
node scripts/validate-speakwise-browser.mjs
node scripts/validate-speakwise-realtime.mjs
```

The new browser suite simulates provider WebRTC events while using real local Next/Python
services and ephemeral SQL for transcript saves. It covers mute, typed turns in voice mode,
late and duplicate transcription, failed-save retry, reconnect, microphone denial, reload,
lesson completion, responsive geometry and accessibility. It does not certify physical
microphones, Safari/iPhone or production deployment.

Official API references: [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
[Realtime Mini](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini),
[WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc).

Verification on 2026-10-04: Node 22 production build, TypeScript and ESLint passed;
106 Node backend tests and 35 Python API tests passed. The existing browser suite
passed 14 workflow checks across 11 viewports, and the voice suite passed its six
scenario groups with no Axe findings. Live calls with the configured OpenAI project
also succeeded for Luna text, Realtime WAV read-aloud, a typed WebRTC turn, and a
speech-to-speech WebRTC turn using generated sample audio with trailing silence.
The live speech check observed speech-started/stopped, input transcription completion,
assistant transcript completion and a remote audio track. Physical microphone hardware,
Safari/iPhone behavior and production deployment remain unverified.

## In-conversation materials — 2026-10-04

SpeakWise now fixes the learning target to English, including restored settings,
chat generation, reading generation and voice transcription. Setup contains no
language selector or material-preparation control. Even PDF mode can start with
no file; material invitations use a validated `open_materials` action whose button
opens a picker only when clicked. The persistent `教材を追加 / Add materials` button
also opens PDF, VocabStream, VidMatch and saved/generated reading tools.

Material changes retain the session ID, conversation, draft, elapsed time and
learning state. The selected title stays visible above chat and reopens its pane.
The mobile/tablet pane has a sticky return button and supports Escape with focus
restoration; desktop retains the conversation beside the material. Uploads and
pending material fetches can be canceled, failed selections retain the prior
source, and saved sources reload with the lesson. Native PDF extraction limits
and missing video transcripts are disclosed rather than treated as readable text.

The VocabStream picker previews the canonical course/lesson, then saves its actual
words, definitions and examples as an owned excerpt in the existing
`speakwise_scripts` table. Request IDs make retries idempotent. This lets the
separate Render API retrieve the same content without copying the vocabulary
catalog into another deployment. Word practice keeps its source course/lesson
identity. No database migration or dependency change is required.

Voice connections receive a bounded preview of the current material. Changing
material closes the previous voice connection; the learner can resume voice in
the same saved lesson with the new source and existing conversation. Typed chat
retains focused/full-document retrieval. A voice preview does not establish full
PDF coverage or access to video visuals.

Validation used Node 22.23.3, Chrome viewport emulation, the actual Next production
build and Python service, and the isolated SQL/Auth/model fixtures described
above. No production account records or environment files were changed.

| Check | Result |
| --- | --- |
| `npm run prebuild` | All existing vocabulary/content/image/ambiguity/audio audits passed |
| `npm run build --ignore-scripts` | Production build passed; postbuild sitemap generation deliberately skipped to preserve the existing local sitemap edits |
| `npm run typecheck`, `npm run lint`, `git diff --check` | Passed, no lint warnings |
| `npm run test:backend` | 106 passed |
| `npm run test:speakwise-api` | 39 passed, including typed invitations, canonical vocabulary grounding, indexed video grounding and selected-source voice context |
| `scripts/validate-speakwise-workflows.mjs` | 11 local integration checks passed, including English settings, ownership and selection retry identity |
| `scripts/validate-speakwise-browser.mjs` | 21 checks / 86 API requests passed against the production build |
| Responsive/accessibility | Eight material/lesson states at 11 viewports from 320–1920px including landscape; zero horizontal overflow, zero Axe findings; reduced-height composer and keyboard focus verified |
| `scripts/validate-speakwise-realtime.mjs` | Six scenario groups passed, including transcript recovery, microphone denial and six responsive viewports |

The browser suite covers optional PDF starts, a lost welcome response, explicit
invitation acceptance, canceled pending uploads, failed PDF/video loads, preview
cancellation, canonical vocabulary reaching the tutor, source switching without a
new session, refresh recovery, reading answers, shared word progress, completion,
and deletion of a PDF with its derived reading artifact. The production run also
caught and fixed a setup hydration race: setup fields now wait for saved settings
before accepting changes.

Logs and screenshots for this run are under `/tmp/speakwise-materials-*.log` and
`/tmp/speakwise-materials-verification/`. Hosted deployment, live model invitation
quality, live catalog/provider behavior and physical iOS/Android microphones or
keyboards were not verified in this change. Ship the Next frontend/API and Render
Python changes together; the deployed site has not been updated by this work.
