# SpeakWise API

Python 3.11+ FastAPI service. `requirements.txt` includes the audited transitive pins in `constraints.txt`. Run one Uvicorn worker/instance: rate and concurrency budgets are process-local. Use a shared limiter before horizontal scaling.

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
| `OPENAI_CHAT_MODEL` | OpenAI model enabled for the project | No | Optional; defaults to `gpt-4o-mini` |
| `OPENAI_TTS_MODEL` | OpenAI speech model enabled for the project | No | Optional; defaults to `gpt-4o-mini-tts` |

Set `NEXT_PUBLIC_SPEAKWISE_API_URL` in the **Next frontend build environment** to this service's HTTPS origin. No private API key belongs in a `NEXT_PUBLIC_` variable. Frontend requests include the current Supabase access token; expired/anonymous/missing sessions cannot use paid AI endpoints. `/health` is public liveness and does not call providers or establish their readiness.

## API contract

- `GET/HEAD /health`: liveness, HTTP 200.
- `POST /api/chat`: `{ message, mode, ...lessonContext }` → `{ reply, mode }`. Agent history keeps the last 16 messages; browser learner-memory context is projected below 18,000 UTF-8 JSON bytes.
- `POST /api/voice`: `{ text, voice }` → a continuous streamed MP3. Supported voices are validated; text is limited to 4,096 characters.
- `POST /api/lesson-summary`: `{ history, ...lessonContext }` → `{ summary, farewell }`. Summaries consider up to 100 recent conversation messages within an 80,000-byte transcript budget; older context is omitted for very long lessons. Generation does **not** claim persistence; Next saves the summary separately.
- `POST /api/feedback`: `{ question, userAnswer, level?, tests?, skills?, practiceMode? }` → `{ feedback }`.
- `POST /api/improved-version`: same answer context → `{ improvedVersion }`.

All POST routes require `Authorization: Bearer <Supabase access token>`. Requests have a 128 KiB transport limit and bounded typed fields. Errors use `{ error, code }`; 401 means sign in, 413/422 means correct input, 429 means wait (`Retry-After`), and 502/503/504 means a provider/configuration/transient failure. Invalid modes are 422. Provider errors never include raw exception text or prompts.

Each authenticated user gets 30 requests/minute, 300/hour and at most 2 active requests; the instance permits 24 active paid operations. There are no automatic retries for paid network/timeouts/rate errors. A model explicitly rejecting `response_format` can fall back once without that option. Malformed rewriting output can trigger one plain rewrite. LLM calls have a 45-second total deadline and transport deadlines; TTS initial audio has a 30-second deadline and the remaining stream a 60-second deadline. Provider connections are reused and closed on shutdown. Stream cancellation closes the upstream response.

## Speech path and evidence

The browser uses Web Speech Recognition, with typed input when unavailable. There is no server STT upload, STT credential, WebSocket or automatic end-of-turn detector. Final speech is placed in the composer and the learner presses Send.

Text generation uses the asynchronous streamed provider API to measure first-token and total generation time, then returns one complete JSON answer. TTS starts immediately after that answer; its provider response is relayed progressively instead of buffered as a complete file. The browser appends MP3 bytes to a MediaSource when supported; other browsers download the same stream to a Blob. Playback rejection exposes a manual-play action that reuses prepared audio. New speech input, a new turn, lesson end and unmount cancel old audio.

We intentionally retain one continuous TTS utterance for natural prosody. Streaming text into sentence-level TTS, browser STT replacement, automatic turn detection and realtime speech-to-speech need a separate product/quality evaluation. MP3 streaming support is feature-detected; real Safari/iPhone autoplay and audio behavior must still be smoke-tested. Browser `playing` measures playback start, not physical speaker output.

Structured server logs contain `request_id`, route/status, LLM first-token/total milliseconds, TTS first-chunk/total milliseconds, and error stage/type. Browser `speakwise_timing` logs contain recognition finalization, reply arrival, audio first-byte and playback timings without transcript text. `Server-Timing`, `X-Request-ID` and `Retry-After` are exposed over CORS. Use browser Network/Performance together with matching server request IDs. Provider latency and physical-device improvements have not been benchmarked against live paid APIs.

## Offline verification

```sh
api/speakwise/.venv/bin/python -m unittest discover -s api/speakwise/tests -v
node --test --experimental-strip-types apps/speakwise/src/lib/*.test.ts
npm run typecheck
npm run lint
npm run build
```

The Python tests replace both Supabase Auth and OpenAI; they cannot spend API credits or change live user data. Browser fixture validation uses `scripts/validate-speaking.mjs`. Production deployment ordering and environment ownership are documented at the repository root.
