# Local SpeakWise verification artifacts

2026-10-01; Node 22.18.0, Python 3.13.0, macOS arm64. All user/content/model data in these files is synthetic. See [operations and limitations](../speakwise-learning-operations.md) and [capability matrix](../speakwise-learning-audit.md).

- `browser-results.txt`: actual production-build Next/Python/SQL flows with synthetic Auth/PostgREST/model adapters; 14 checks, 52 API requests, zero runtime errors. Six activity states each passed eleven viewport geometries and an Axe check. The deliberate lost-response 503 is an injected network fault after a real saved model response.
- `*-390.png`, `*-768.png`, and `*-1440.png`: Chrome mobile, tablet and desktop viewport screenshots, with representative renders manually inspected. `keyboard-emulation-390.png` reduces viewport height to400 px; no physical keyboard/microphone test. Reading-script repetition is deterministic fixture text, not a live generation-quality claim.
- `http-workflow-results.txt` and `http-timings.json`:9 application scenarios,29 timed HTTP requests. Real PDF extraction, SQL and application behavior; no live OpenAI or hosted Supabase.
- `sql-results.txt` and `existing-database-results.txt`:12 new and27 existing SQL scenarios. Single-connection PostgreSQL/WASM omits only unavailable pgcrypto extension setup.
- `retrieval-results.json`:5 synthetic memory tasks and4 catalog tasks (one has no relevant results), frozen-time relevance labels and tiny-corpus local timings.
- `source-retrieval-results.json`:8 source queries across12 synthetic pages; source coverage and character-budget baseline comparison.

Production build, TypeScript, ESLint,27 frontend tests,100 backend/shared tests and31 Python tests passed. No production deploy, hosted migration, or real-user data mutation was performed. This directory is a reproducible engineering receipt, not a learning-efficacy study.
