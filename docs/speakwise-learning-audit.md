# SpeakWise learning implementation and capability audit

Audit date: 2026-10-01. The checkout was clean before this work. This document records the inspected baseline and is updated with implementation and verification evidence before handoff. Nothing in this work authorizes production deployment, hosted schema changes, or production learner-data writes.

## Existing boundaries

- Next.js 15 App Router mounts SpeakWise through `app/speakwise/[[...slug]]/page.tsx`; `apps/speakwise/src/pages/AI_chat.tsx` owns the lesson UI. The application APIs run on Vercel.
- `api/speakwise/main.py` is an independent authenticated FastAPI service intended for Render. `.vercelignore` excludes that directory. Existing streaming speech playback stays in this service.
- Supabase is the shared authentication and persistence system. The Next server verifies access tokens before using its service credential; Python uses the user's access token and a publishable/anon key. New private records require RLS as well as ownership checks.
- VocabStream's canonical entries, sense examples, question policy, and licensed image metadata live in `public/vocabstream/data`; existing attempts and review records live in Supabase.
- VidMatch has curated video metadata, availability filtering, open history, and transcript/chunk tables. At inspection there is no text-content expansion in this checkout. A database transcript flag is not proof that usable transcript text exists.

## Capability matrix

| Promise or workflow | Inspected behavior | Required implementation | Verification target |
| --- | --- | --- | --- |
| PDF-based reading | Paste/text-file only; browser keeps 8,000 characters; agent prompt keeps 6,000 | Authenticated PDF extraction with ownership, page/chunk persistence, complete-document search, selection and honest scanned-page status | Multi-page fixture with final-page fact; source isolation; blank/scanned document; malformed and oversized input |
| Whole-document summary | Same initial excerpt used for every task | Explicit coverage process over every readable page, bounded work, and gaps disclosed | End-of-document coverage and refusal to present incomplete reading as complete |
| Reading script | Prompt describes reading activities; no saved artifact | Typed generation, source kind/references/settings, persistent artifact, reopen/listen/word/comprehension flow | Create, reload, reopen and use a script; reject invented citation IDs |
| VidMatch within lesson | History injected into prompt; no real catalog action | Authenticated search/select, stable resource cards, actual transcript/text availability, impression/open/activity distinction | Real route with isolated catalog fixture; empty result; metadata-only video; source-backed activity |
| In-lesson VocabStream | Conversational word practice only | Canonical interactive practice, reviewed answer policy, idempotent shared attempts and hint evidence | Answer and retry; database contains one shared outcome; reveal is not mastery |
| Persistent conversation | React state; session ID saved after start; refresh loses conversation | Incremental messages and activity state, stable operation IDs, recovery before starting another lesson | Refresh/reconnect restores messages and source; duplicate requests remain one outcome |
| Lesson recap | Browser sends up to 100 messages; generated summary trusted by persistence route | Authoritative records, evidence references, observed/inferred separation, provisional/final lifecycle | Retry completion, generation/write failures, assistant examples excluded from learner mistakes |
| Longitudinal memory | Latest five summaries, lifetime top mistake counts, recent cross-app rows | Task-aware historical lookup, confidence/time/recovery, confirmed profile separate from inferred state | Older relevant evidence beats recent irrelevant evidence; recent success reduces stale difficulty |
| Memory controls | No inspect/correct/delete flow | Explicit profile editing and deletion/reset with derived-state invalidation | Owned-only changes; reset does not resurrect derived history |
| Reliable actions | Free-text replies can describe actions without application execution | Bounded allowlisted typed actions; success only after execution; safe structured errors | Invalid tools/arguments, failed save, injected source instructions, owner spoofing |
| Responsive lessons | Existing mobile setup/settings and speech flow; no actual source/activity panels | Accessible source/script/resource/vocab/memory surfaces with bounded scroll, stable input and touch targets | 320–1920px, tablet/landscape, reduced viewport keyboard emulation, keyboard and Axe checks |

## Prompt audit baseline

`api/speakwise/main.py` contains mode workflows, agent/system conversation prompts, feedback, improved-answer variants, lesson-summary prompts and permissive normalizers. `lessonGreetings.ts`, `openingQuestions.ts`, and `promptMemory.ts` supply frontend starts and context. There was no action-selection, source-grounding, or saved-script contract. Specific problems found: source and memory inserted as instruction-like system text; pronunciation suggestions based solely on transcript; default summary strengths invented when evidence was absent; latest-N history and memory loading; source excerpts silently shortened; no verified action results.

The coordinated policy must distinguish learner-authored statements, ASR uncertainty, quoted source text and assistant examples; keep one manageable task/correction at a time; never treat source or memory contents as tool instructions; and keep profile, lesson state, evidence and source passages distinct. Prompt and structured output versions travel with generated artifacts.

## Implemented capability matrix and verified status

Status terminology: **local pass** means the real application/SQL path was exercised with synthetic external Auth/model adapters. **contract pass** means deterministic unit/SQL enforcement; it does not establish live model adherence. **staging pending** means no hosted/provider/device claim is made. These are implementation results, not production availability claims.

| Capability | Implemented behavior | Verification obtained | Remaining boundary |
| --- | --- | --- | --- |
| Private PDF learning | Owned native extraction; pages/chunks; full-document search; selected-document isolation; readable/partial/unreadable status | Local pass: actual three-page PDF and final-page reference, foreign-owner 404, malformed/blank PDFs; Python extraction bounds and source tests | OCR unavailable; rendered figures/layout not understood; Render Linux resource-bound smoke pending |
| Whole-document requests | Direct all-passage context or bounded map over every passage, explicit coverage/gaps, citations checked against sources | Local all-page coverage plus contract tests for mapped passage completeness, invalid/missing references and unreadable pages | Real-model summary fidelity and large-document hosted latency pending |
| Saved guided reading | Source excerpt, adaptation or original; level/language/length/vocabulary settings; durable artifact, questions, speech sections, library pagination | Local create/retry/reopen; browser saved response survives refresh; provider-failure tests | Reference-answer submission is unscored; live difficulty/meaning preservation and TTS pending |
| VidMatch actions | Catalog search and actionable cards for videos and indexed text; actual selection/body/transcript; distinct impressions/open/activity evidence | Local video/text/empty results and missing-transcript cases; browser article activity; catalog SQL ranking fixtures | Text catalog intentionally empty until reviewed import; no new crawler/transcript acquisition; live playback pending |
| Canonical vocabulary practice | Interactive reviewed cards, current-passage context, existing licensed assets, hint/attempt records, atomic shared VocabStream progress | Local card answer/retry and shared memory; SQL one-attempt/reveal/recovery cases; browser natural-language tool execution | Private unknown-word entries need learner confirmation; historical hint/sense provenance incomplete |
| Refresh/interruption/retry | Saved messages/events, explicit source IDs, stable requests, serialized state, source/card/script recovery, completed status | Browser reload/script answer recovery and lost-welcome-response retry; SQL no duplicate completion/attempt; late writes rejected | Concurrent browser tabs may overwrite mutable settings/state; hosted multi-connection races pending |
| User-facing and machine summaries | Authoritative complete saved record traversal; schema-v2 summary; exact evidence references; observed/inferred/uncertain fields; provisional active recap | Local completion ignores client summary content; SQL validates evidence and one final result; policy tests exclude assistant/quoted examples | No invented historical backfill; summary prose is deliberately deterministic rather than an extra unreliable generation step |
| Longitudinal personalization | Confirmed profile; task-aware historical SQL candidates; confidence/time/category-aware recovery; separate source context | Older weakness found beyond 1,000 newer rows; shared recent successes reduce old priority; synthetic Recall@3 comparison | Lexical baseline, not semantic retrieval; no learning-efficacy claim; fine-grained legacy senses may be unknown |
| Memory controls | Inspect evidence, edit confirmed preferences, disable memory, reset derived state or delete SpeakWise artifacts with retrieval boundary | SQL owned reset/deletion, cross-user isolation, no revival of excluded history; language persists after refresh | Individual inferred observations lack edit/delete UI; retained cross-app progress and session analytics are clearly disclosed |
| Prompt/action reliability | Versioned policies and typed allowlist; source/memory treated as data; fixed authenticated identity; bounded tools and outputs; confirmed writes before success | 31 Python tests and 12 TypeScript policy tests including injection-shaped inputs, invalid actions/citations, failure/no false success, all 11 modes | Prompt-injection resistance is layered, not proof against every real-model attack; live red-team checks pending |
| Responsive and accessible UI | Setup before lesson; collapsible settings/source tools; mobile tabs, desktop panels; bounded scroll/sticky headings/input, safe areas, focus and labels | Six actual activity states × eleven widths/orientations from 320–1920; Axe; reduced-height input; Chrome runtime checks | Desktop browser emulation only; physical Safari/Android keyboard, microphone, and voice playback pending |

Important implementation paths: Python `api/speakwise/{learning,documents,prompts}.py`; Next `app/api/speakwise/{learning,lesson-sessions,learner-memory}` and `learningPolicy.ts`; UI `apps/speakwise/src/pages/AI_chat.tsx` and `components/`; additive migration `supabase/migrations/20261001000100_speakwise_learning.sql`. The [prompt audit](speakwise-prompt-audit.md) covers every relevant prompt family. The [operations receipt](speakwise-learning-operations.md) contains setup, exact test commands/results, retrieval comparisons and external blockers; [data notes](speakwise-learning-data.md) cover migration/recovery and retained-history semantics.

## Verification boundaries

Automated provider fixtures prove request validation, application execution, rendering and error handling, not live model quality. Local PostgreSQL/WASM tests execute real migration/RPC SQL but do not reproduce hosted PostgREST, concurrent database connections, Supabase Auth or Render resource limits. Browser emulation is not a physical iOS/Android keyboard or microphone test. The final verification receipt identifies these boundaries and any remaining external checks.

## Reference decisions

Native extraction is preferred. PDF text has no reliable semantic table/figure structure; image-only documents need OCR, and oversized decoded streams can consume disproportionate memory. The implementation must bound processing and disclose these limits rather than invent figure understanding. [pypdf extraction documentation](https://pypdf.readthedocs.io/en/stable/user/extract-text.html).

RLS must protect private tables even when accessed directly by an authenticated client; privileged application paths must independently enforce ownership. [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).
