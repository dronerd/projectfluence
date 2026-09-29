# SpeakWise frontend

Mounted by Next at `/speakwise`; `src/pages/AI_chat.tsx` owns setup, conversation and recap. Supabase Auth sessions authorize the separate FastAPI AI service and same-origin Next persistence routes.

Settings and learner memory load concurrently. Failed settings retrieval never saves fallback defaults. A lesson uses one client UUID for idempotent session creation; recap persistence waits for that session and exposes a retry when saving fails.

`src/lib/voicePlayback.ts` handles progressive MP3 media playback with same-download Blob fallback, bounded buffering and cancellation. See `api/speakwise/README.md` for the complete voice pipeline, limitations, instrumentation and local setup.
