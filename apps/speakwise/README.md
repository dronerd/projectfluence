# SpeakWise frontend

SpeakWise is mounted at `/speakwise` by the Next.js App Router. It uses the existing Supabase project and a separate Python service. The [capability audit](../../docs/speakwise-learning-audit.md) records the inspected baseline, implemented behavior, and verification limits. See the [operations guide](../../docs/speakwise-learning-operations.md) for migration order, recovery, evaluation results, and deployment checks.

## Runtime boundaries and setup

| Component | Responsibility | Configuration |
| --- | --- | --- |
| Next.js on Vercel | Frontend, authenticated lesson state/completion, catalog actions, shared vocabulary progress, learner-memory controls | Browser: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SPEAKWISE_API_URL`. Server only: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. |
| Python/FastAPI on Render | Bounded native PDF extraction, document retrieval, source-grounded tutoring, saved-script generation, streaming speech | `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, exact `SPEAKWISE_CORS_ORIGINS`; optional model settings. |
| Existing Supabase project | Authentication, private documents/scripts/messages/events, structured summaries and preferences, canonical VocabStream attempts/review, VidMatch catalog/history | Additive `20261001000100_speakwise_learning.sql` migration and preceding repository migrations. |

Both services use the same Supabase project. Browser calls carry the current Supabase access token. Python verifies ownership and uses the user's token with RLS; privileged Next routes independently enforce ownership. Private credentials must never use a `NEXT_PUBLIC_` name. Python processing remains outside the Vercel runtime.

Use the repository's Node version (`>=22.18 <23`) and Python 3.11+. From the repository root:

```sh
npm ci
python3 -m venv api/speakwise/.venv
api/speakwise/.venv/bin/pip install -r api/speakwise/requirements.txt
npm run dev:speakwise-api
```

In another terminal, run `npm run dev:speakwise`. That command points the frontend at `http://127.0.0.1:8000`. Configure Next's local environment and `api/speakwise/.env` using the variables above, including the exact local frontend origin in CORS. Apply the learning migration to an isolated local/test database first. No script in the frontend automatically applies a hosted migration or deploys either service. The [Python service README](../../api/speakwise/README.md) specifies processing budgets, model configuration, API contracts, and speech behavior.

## Learning experience

1. Choose the lesson mode, level, study time, target language, and optional topics before starting. During a lesson, settings collapse on smaller screens and the **教材** control opens learning material without ending the conversation.
2. Upload a private PDF or open a saved document. The PDF tab shows processing status, extraction warnings, and a page selector with the extracted text. Focused questions search the selected document; whole-document requests use the backend's coverage process. Unreadable/scanned pages and figures/tables have explicit limitations. OCR is not enabled. Saved document and script libraries provide pagination to older records.
3. Create a reading artifact from a selected PDF, indexed VidMatch resource, or a topic. Excerpts, simplified adaptations, and original generated passages are labeled separately. The artifact retains its references and settings. Learners can listen, inspect words, submit comprehension responses, and discuss their own summary. Reopened scripts restore saved comprehension responses; open-ended answers are recorded without claiming automatic correctness.
4. Search VidMatch through the lesson. Cards use actual stable catalog IDs and show source, type, duration, availability, and recommendation reasons. Selecting a resource changes the lesson source; opening its external link records a distinct interaction. Preview passages are labeled as previews. Metadata-only videos do not support transcript-grounded exercises. Playback uses the resource's existing external action rather than an invented transcript or player.
5. Start short vocabulary practice by requesting it in conversation, selecting a source word, or using the vocabulary tab. Cards reuse VocabStream's question policy, senses, examples, and licensed images. The backend scores submitted answers and records an idempotent shared attempt. Hints and reveals do not establish mastery. Noncatalog words can be saved with a learner-confirmed definition as private vocabulary; this does not create a shared catalog entry or a scored VocabStream exercise.
6. Finish the lesson to receive a summary assembled from saved messages and learning events. It separates observed outcomes from tentative correction observations, future recommendations, and missing evidence. Merely opening a source or seeing an answer is not reported as improvement.

Natural-language action proposals are typed. The application executes the allowed API action and displays its actual result, loading state, empty result, or error. A proposal alone is not a successful save/search. Restored assistant actions expose an explicit retry control; hydration does not automatically repeat them.

## Persistence and recovery

`src/pages/AI_chat.tsx` coordinates authentication, settings, the saved session, conversation, and speech. The UI creates the owned session before asking for its first assistant reply. User messages are persisted before tutoring; Python saves assistant replies. The client appends only confirmed assistant responses.

Messages carry stable IDs and a bounded request-context snapshot. Retrying a saved user turn keeps its original source/settings and request ID; changing arguments under the same ID is rejected. Script actions use the saved assistant-message ID as their operation ID. Vocabulary attempts and comprehension submissions keep stable IDs across request retries. These identifiers prevent dropped responses from becoming duplicate scored writes.

Selected source/card state saves immediately, and active session state also saves periodically. Clearing or switching a source sends explicit nulls so a previous document cannot remain in merged server state. Refresh restores the latest active session, saved messages, source/artifact IDs, vocabulary outcomes, and submitted comprehension answers. Only saved elapsed time resumes; time away from the page is not counted as learning. An unsaved draft or a request that failed before persistence cannot be reconstructed after refresh.

Completion uses authoritative server records and an idempotent completion operation. Provisional summaries remain distinct from finalized summaries. A failed completion exposes a retry, and saved messages remain recoverable. Saved source libraries can be reopened independently of an active lesson; the main lesson UI resumes the latest active session rather than providing a separate browser for every historical conversation.

Memory controls inspect stored evidence, edit confirmed goals/interests and correction style, enable/disable historical personalization, and explicitly reset/delete records. Reset confirmation lists the actual affected records: history reset removes SpeakWise messages/events/summaries and interrupts active lessons; full deletion additionally removes documents, scripts, private words, and confirmed profile preferences. Canonical VocabStream progress and VidMatch history remain, with pre-reset evidence excluded from new personalization. The UI stops queued session writes before reset. Individual practice events cannot be edited through this interface; preference correction and explicit history reset are the available controls.

## Source, practice, and audio components

- `src/components/LearningWorkspace.tsx`: document/script libraries, PDF page reading, resource cards, vocabulary exercises, private-word capture, and artifact recovery.
- `src/components/MemoryControls.tsx`: profile/preferences and accurately scoped history controls.
- `src/components/SourcePassage.tsx`: source text selection and explicit TTS segments for long passages.
- `src/lib/learning.ts`: shared frontend action/source shapes and safe rendering helpers.
- `src/lib/voicePlayback.ts`: progressive MP3 playback with same-download Blob fallback, bounded buffering, and cancellation.

Source text is rendered as escaped text. Document passages and source excerpts remain distinct from generated text. The native audio control provides pause, seeking, and replay. Long reading material offers selectable segments within the TTS request limit instead of silently cutting the passage. Autoplay and unsupported microphone failures expose actionable fallbacks. Speech-recognition input carries its origin in saved message metadata; a text transcript is not a pronunciation assessment.

## Responsive and accessibility behavior

Desktop can place source material beside the conversation. At narrower widths, a focused material pane replaces the conversation temporarily, with sticky tabs and a close control. Setup stays before the lesson, settings collapse during it, and the conversation scrolls inside a bounded viewport above a stable composer. Dynamic viewport units and safe-area padding support small screens and reduced keyboard-height viewports.

Pane transitions move and restore keyboard focus without scrolling the reader to a new position. New messages scroll to the bottom only when the learner was already near it. Source tabs support arrow-key navigation. Native forms, accessible names/statuses, visible focus, wrapping text, touch-sized controls, and a separate audio row support the learning surfaces and failure states.

The browser verification scripts exercise approximately 320–1920 px, tablet/landscape sizes, and a reduced-height keyboard simulation. These are desktop-browser emulations, not physical iPhone/Android keyboard, microphone, or live playback tests.

## Verification

From the repository root:

```sh
npm run typecheck
npm run lint
node --test --experimental-strip-types apps/speakwise/src/lib/voicePlayback.test.ts
npm run test:speakwise-api
```

`validate-speakwise-browser.mjs`, `validate-speakwise-workflows.mjs`, and `validate-speakwise-db.mjs` under `scripts/` cover the connected local flow. Run them only with the isolated fixture environment described in the operations guide: some fixtures reset test records. The tests use real application routes, native PDF extraction, and isolated SQL alongside synthetic authentication/model/catalog inputs. Passing them does not establish hosted Supabase compatibility, paid-provider generation quality, a populated production text catalog, physical-device speech behavior, or a measured learning benefit.
