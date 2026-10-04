# SpeakWise API

Render-hosted FastAPI service for the Next.js application/API on Vercel, using the existing shared Supabase Auth/PostgreSQL project. Python processing stays outside Vercel. The committed runtime pin is Python 3.13; local verification used 3.13.0. `requirements.txt` includes transitive pins in `constraints.txt` and native PDF extraction through `pypdf==6.19.0`. Run one Uvicorn worker/instance: rate and concurrency budgets are process-local.

## Local setup

```sh
python3 -m venv api/speakwise/.venv
api/speakwise/.venv/bin/pip install -r api/speakwise/requirements.txt
npm run dev:speakwise-api
# Second terminal, from repository root:
npm run dev:speakwise
```

Set these in `api/speakwise/.env` locally or the **Python web service** environment on Render. Never commit this file.

| Variable | Value source | Secret? | Purpose |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | OpenAI project API keys | Yes | Server-side chat and speech |
| `SUPABASE_URL` | Supabase project API settings | No | Same project as the frontend |
| `SUPABASE_ANON_KEY` | Supabase project publishable/anon key | No | Validate bearer tokens using Auth `/user`; never use service role here |
| `SPEAKWISE_CORS_ORIGINS` | Exact Next frontend origins, comma-separated | No | Production frontend/custom domain; no trailing slashes or wildcards |
| `OPENAI_CHAT_MODEL` | OpenAI model enabled for the project | No | Optional; defaults to `gpt-6-luna` |
| `OPENAI_REALTIME_MODEL` | OpenAI realtime model enabled for the project | No | Optional; defaults to `gpt-realtime-2.1-mini` |
| `OPENAI_TRANSCRIBE_MODEL` | Realtime input transcription model | No | Optional; defaults to `gpt-transcribe` |

Set `NEXT_PUBLIC_SPEAKWISE_API_URL` in the **Next frontend build environment** to this service's HTTPS origin. No private API key belongs in a `NEXT_PUBLIC_` variable. Frontend requests include the current Supabase access token; expired/anonymous/missing sessions cannot use paid AI endpoints. `/health` is public liveness and does not call providers or establish their readiness.

Next also needs the existing `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL` and server-only
`SUPABASE_SERVICE_ROLE_KEY`. Python uses the anon/publishable key plus the verified
user's JWT for document, script, message and memory REST calls. Never put the
service credential in Python or the browser. All three layers use the same project.
No Storage bucket, external vector database or OCR service is required.

## API contract

The `20261001000100_speakwise_learning.sql` migration adds the owned records used
by the learning routes below. Apply it to a local/test Supabase project first;
this change does not apply any migration or deploy a service automatically. Apply
the existing migration chain in timestamp order; do not reapply per-app schema
snapshots afterward. Keep the additive schema if rolling application code back;
deleting the new tables would delete newly saved learner work. Review deployment
and recovery steps in the [learning audit](../../docs/speakwise-learning-audit.md).

- `POST /api/documents`: authenticated raw `application/pdf`, `X-Filename`
  percent-encoded original filename → `{document,reused}`. At most 8 MiB, 80
  pages, 180,000 extracted characters and 24,000 characters on one page. Identical
  uploads for the same account reuse the document. Binary uploads are discarded
  after extraction; only private page text/status/warnings are stored in Supabase.
- `GET /api/documents?offset=0`: metadata `{documents,nextOffset}`; `GET
  /api/documents/{id}` adds original extracted page text. `DELETE` atomically
  removes that private source, derived reading scripts and stale active selections
  through `delete_speakwise_document`. Other historical conversation text remains
  lesson history; use the memory/history deletion controls to remove it.
- `POST /api/documents/{id}/retrieve`: `{query,scope:"focused"|"whole"}` → actual
  page passages, warnings and explicit coverage. Focused retrieval ranks chunks
  across **all** readable pages using a lexical BM25 baseline with explicit page
  lookup, duplicate suppression and page diversity; no external vector database.
- `POST /api/learning/chat`: `{sessionId,requestId,message,documentId?|contentId?|
  scriptId?,scope?,level?,targetLanguage?,lessonMode?,topics?}` → `{messageId,
  reply,citations,coverage,action,observations,promptVersion,reused}`. Zero or one
  selected source; `contentId` is a real text-catalog UUID or raw video ID.
  The user turn must already be saved through the Next session API; the initial
  start instruction is allowed for an empty lesson. Python reads owned persisted
  messages and shared memory retrieval, validates output and saves the assistant
  reply before returning success. It does not accept browser-supplied history,
  source text or arbitrary user IDs.
- `POST /api/learning/script`: `{requestId,sessionId?,documentId?|contentId?|topic,
  level?,targetLanguage?,kind:"excerpt"|"adaptation"|"original",lengthWords:80..1000,
  vocabulary?}` → `{script,reused}` with persisted body, questions, source
  references and generation settings. Source excerpts are copied by application
  code; adaptations must cite supplied source IDs. Topic scripts are original.
  `GET /api/learning/scripts?offset=0` and `GET /api/learning/scripts/{id}` reopen
  saved artifacts. Lists return `nextOffset` rather than silently hiding older rows.

Stable `requestId` values make chat/script retries idempotent. The saved request
fingerprint rejects the same ID reused for different input with HTTP 409. Never
save a second copy of the Python-generated assistant message from the browser.

The typed action union is a **proposal**, not a successful tool result:
`search_content {query,contentType}`, `practice_vocabulary {word}`, and
`create_script {topic,kind,lengthWords}`. The frontend dispatches these to the
authenticated catalog/vocabulary/script APIs and renders their actual results.
No action has a user identity, arbitrary URL, table name or freeform write payload.
Action replies are replaced with pending language until the application succeeds.

Lesson lifecycle runs through the authenticated **Next**
`/api/speakwise/lesson-sessions` endpoint: `POST` creates a session, `PATCH` saves
messages/state/events during the lesson, `GET` reopens it, and `POST
{action:"complete",sessionId}` finalizes a summary from authoritative persisted
records. Provisional summaries are available during recovery. Finalization is
deterministic and transactional; it does not depend on another model call or a
browser-submitted summary. Completed activities and scored vocabulary outcomes
remain distinct from recommendations and unscored comprehension submissions.

Existing speech and writing clients retain these compatible routes:

- `GET/HEAD /health`: liveness, HTTP 200.
- `POST /api/chat`: `{ message, mode, ...lessonContext }` → `{ reply, mode }`. Compatibility route only: agent history keeps the last 16 messages. It does not execute learning tools or persist conversation. The current learning UI uses `/api/learning/chat`.
- `POST /api/voice`: `{ text, voice }` → a replayable WAV generated with Realtime over a server WebSocket. Text is limited to 4,096 characters. No microphone permission is needed.
- `POST /api/realtime/calls`: `{ sessionId, sdp, voice, targetLanguage }` → `{ sdp, callId, expiresIn }`. Verifies lesson ownership, loads lesson context and memory, then negotiates WebRTC with a server-held OpenAI key.
- `DELETE /api/realtime/calls/{callId}`: closes the authenticated learner’s voice connection.
- `POST /api/lesson-summary`: `{ history, ...lessonContext }` → `{ summary, farewell }`. Compatibility generation only: up to 100 caller-supplied messages, each normalized to 4,000 characters, within the JSON transport limit. Its output is explicitly provisional and is **not** accepted by the current persistence API. The current UI completes the saved session through Next instead.
- `POST /api/feedback`: `{ question, userAnswer, level?, tests?, skills?, practiceMode? }` → `{ feedback }`.
- `POST /api/improved-version`: same answer context → `{ improvedVersion }`.

All learning routes and existing POST routes require `Authorization: Bearer <Supabase access token>`. JSON requests have a 128 KiB transport limit; the PDF upload route permits 8 MiB. Errors use `{ error, code }`; 401 means sign in, 413/422 means correct input, 429 means wait (`Retry-After`), and 502/503/504 means a provider/configuration/transient failure. Invalid modes are 422. Provider errors never include raw exception text or prompts.

Each authenticated user gets 30 requests/minute, 300/hour and at most 2 active requests; the instance permits 24 active authenticated operations, including document/list reads. There are no automatic retries for paid network/timeouts/rate errors. A model explicitly rejecting `response_format` can fall back once without that option. Invalid structured rewriting output can trigger one plain rewrite. Each LLM call has a 45-second deadline and transport deadlines; Read-aloud generation has a 75-second deadline and a 12 MiB audio limit. Live WebRTC calls have a separate one-call-per-user, 24-call global budget and a maximum of 20 minutes or the remaining lesson time. Provider connections are reused and closed on shutdown. Stream cancellation closes the upstream response.

## Source processing, memory and prompt policy

`documents.py` runs native extraction in a separate process with an 18-second wall
deadline and 15-second CPU limit. Render/Linux also enforces a 256 MiB address-space
limit on the worker; one PDF worker runs at a time and concurrent extraction receives
a retryable 429. Large upload bodies are read only after authentication and request
budget checks. A complex page can fail without pretending it was read; an
over-budget document fails explicitly rather than silently truncating later pages.
Native extraction cannot interpret scans, diagrams or table layout. OCR is not
configured; image-only PDFs return `unreadable` with an actionable text-export
message. The binary is not retained for later OCR. This follows the parser's
[documented extraction and memory limitations](https://pypdf.readthedocs.io/en/6.19.0/user/extract-text.html).

Focused source context stays below six 1,800-character chunks. Whole-source
requests use all readable text directly below 24,000 characters; larger documents
map every passage through bounded 22,000-character batches, two calls at a time,
then synthesize from explicitly labelled page notes. Every batch must return all
supplied source IDs. At most 12 batches, 45,000 note characters and a 100-second
mapping deadline are allowed. Failed coverage returns an error, never a claimed
whole-document summary. A final response has its ordinary 45-second deadline;
whole-source clients should allow 180 seconds and show a coverage-processing state.
Source/page references are validated against actual selected passages. Generated
page notes are labelled paraphrases; citation excerpts come from extracted text.

Content uses existing `vidmatch_videos`, `vidmatch_transcripts`,
`vidmatch_transcript_chunks` and the additive shared `vidmatch_text_content` table.
No external URL download is performed in Python. Missing indexed transcripts or
article bodies are explicit availability results; they never become invented text.
The metadata-only fallback is generated by application code without invoking a
model. Text content must be populated through a reviewed catalog import; the
migration does not create a production article corpus or enable URL scraping.

`prompts.py` versions coordinated tutoring, source, script and coverage policies as
`speakwise-learning-2026-10-01.1`, schema version 1. Sources/memories are untrusted
data; generated actions and citations are allowlisted/validated before persistence.
Legacy feedback and rewriting prompts share the policy, text-only pronunciation
assessments are removed, malformed feedback is an error, and legacy summaries no
longer fabricate engagement/strengths when absent. Legacy summary output is marked
provisional; the Next saved-session finalization flow is authoritative. The current
chat route restricts mode selection to all 11 existing modes and adds the selected
trusted `LESSON_MODE_PROMPTS` workflow to its policy, together with persisted
planned/elapsed time. See the [prompt audit](../../docs/speakwise-prompt-audit.md)
for every family, its enforcement boundary and remaining quality checks.

Python artifact/turn schema version 1 is distinct from Next lesson-summary schema
version 2 and memory policy `lexical-recency-evidence-v1`; these identifiers describe
different contracts. Legacy endpoints retain their compatibility response shape.

Conversation context uses owned recent messages plus relevant earlier messages,
with explicit excerpt flags and omission counts. The full transcript remains saved
for summaries. Shared `retrieve_speakwise_memory` searches the full user corpus in
PostgreSQL before returning candidates, honors the profile reset boundary and
memory-enabled setting, and supplies canonical VocabStream attempts. Python's
small ranking step weights task relevance, recency and dated outcomes. Recent
unaided correct attempts for the same word and source category reduce old vocabulary
urgency without declaring mastery. Unknown-sense legacy records and grammar
inferences never receive guessed recovery conclusions. Duplicate SpeakWise
activity events are not counted again. Confirmed preferences
do not decay. Conversation corrections are stored as tentative model inferences,
with exact learner-message references, never scored improvements. Quoted/source
copies, assistant examples and speech-recognition input are excluded.

No private text is logged or placed in a shared process cache. Context logs contain
counts, IDs and prompt version only. Profile edits/reset/deletion are read afresh
on the next turn; there is no derived Python cache to invalidate.

## Speech path and evidence

The browser uses Web Speech Recognition, with typed input when unavailable. There is no server STT upload, STT credential, WebSocket or automatic end-of-turn detector. Final speech is placed in the composer and the learner presses Send.

Speech-origin message metadata keeps uncertain recognition out of inferred grammar
evidence. Selected PDF/script passages can use the same audio endpoint and native
play/pause/seek controls. One request permits 4,096 characters; longer reading
material must be played in the selectable sections provided by the lesson panel.

Text generation uses the asynchronous streamed provider API to measure first-token and total generation time, then returns one complete JSON answer. Optional read-aloud uses Realtime over WebSocket and buffers a bounded WAV for native replay controls. Playback rejection exposes a manual-play action that reuses prepared audio. A new turn, lesson end and unmount cancel old audio. Live voice connects directly over WebRTC and remains independent of this read-aloud download.

Live voice now uses WebRTC, automatic server turn detection and interruption. Typed lessons use Luna; read-aloud buttons use Realtime to create one bounded, replayable WAV. Read-aloud waits for this utterance to finish generating. Live conversation does not wait for a second text/TTS request. Real Safari/iPhone autoplay, microphone quality and physical speaker latency still need device checks.

Structured server logs contain `request_id`, route/status, LLM first-token/total milliseconds and error stage/type. Browser `speakwise_timing` logs contain read-aloud first-byte and playback timings without transcript text. `Server-Timing`, `X-Request-ID` and `Retry-After` are exposed over CORS. Use browser Network/Performance together with matching server request IDs. Provider latency and physical-device improvements have not been benchmarked against live paid APIs.

## Local verification

```sh
npm run test:speakwise-api
api/speakwise/.venv/bin/python api/speakwise/tests/evaluate_sources.py
npm run test:backend
npm run eval:speakwise
npm run typecheck
npm run lint
npm run build
```

The Python tests replace both Supabase Auth and OpenAI; they cannot spend API
credits or change live user data. The new SQL/HTTP/browser verification commands
are:

```sh
npm run test:speakwise:sql
FLUENCE_BASE_URL=http://127.0.0.1:3102 FLUENCE_PYTHON_URL=http://127.0.0.1:8100 npm run test:speakwise:workflows
FLUENCE_BASE_URL=http://127.0.0.1:3102 npm run test:speakwise:browser
```

The SQL suite needs `@electric-sql/pglite` resolvable locally, or `PGLITE_MODULE`
pointing to its absolute module path. The HTTP/browser suites require separately
started **isolated** Next/Python servers backed by
`scripts/speakwise-fixture-server.mjs`, never production credentials. That server
uses ephemeral PostgreSQL/WASM and synthetic Auth, PostgREST and model adapters.
Browser tests need Playwright, `@axe-core/playwright`, Chrome, and optionally
`FLUENCE_BROWSER_TOOLS` pointing to their tool installation. The browser suite
deletes fixture learner history at startup and must only run against the isolated
fixture environment. `scripts/validate-speaking.mjs` is an older compatibility
check and is not evidence for the new PDF/script/vocabulary workflows.

Local suites can validate real extraction, application HTTP paths, SQL contracts
and browser interaction while the provider reply is a fixture. They do not prove
OpenAI answer quality, hosted PostgREST/Auth behavior, Render resource limits,
physical-device keyboards/microphones, or real TTS/playback quality. Consult the
[learning audit](../../docs/speakwise-learning-audit.md) for the final combined
verification receipt and exact external checks still required.

The 31 Python tests passed locally on Python 3.13.0, macOS arm64. Native PDF
extraction is real; storage/Auth/provider responses are deterministic fixtures.
Eight labelled synthetic source queries over 12 pages, 200 ranking calls per
method, produced Recall@3 **0.25 → 1.00** and nDCG@3 **0.25 → 0.9539** against the
legacy initial-6,000-character baseline. Whole-document ranking averaged **0.395
ms** (maximum query mean 0.482 ms); selected context averaged 3,339 characters.
These are local CPU/fixture measurements, not live provider/network latency, token
counts, a semantic-retrieval evaluation, or evidence of learning benefit. Re-run
the evaluator to obtain current machine-specific timing.
