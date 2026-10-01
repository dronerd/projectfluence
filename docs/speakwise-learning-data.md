# SpeakWise learning data and operations

The implementation keeps Next.js and its application API on **Vercel**, the Python SpeakWise service on **Render**, and authentication and persistence in the **existing Supabase project**. The new data contract is [20261001000100_speakwise_learning.sql](../supabase/migrations/20261001000100_speakwise_learning.sql). It has been exercised locally; this work does not apply it to a hosted project or deploy either service.

Read this alongside the [capability audit](speakwise-learning-audit.md), [Python API contract](../api/speakwise/README.md), and [root migration guide](../supabase/README.md). The older migration guide's statements that authenticated users cannot read the catalog or write documents describe the earlier baseline. The grants and ownership boundaries below describe the new migration.

## Apply order and prerequisites

Use the root `supabase/migrations` chain, in this order:

1. `20260929000100_application_baseline.sql` — existing learner, session, catalog, and profile tables.
2. `20260929000200_transcript_foundation.sql` — actual transcript metadata and chunks.
3. `20260929000300_atomic_learning_writes.sql` — canonical progress functions, owner checks, hardened grants, and analytics.
4. `20260930000100_vidmatch_curation.sql` — video availability, editorial review, and provider freshness used by SpeakWise search.
5. `20261001000100_speakwise_learning.sql` — the additions documented here.

Do not rerun the historical `apps/*/supabase/schema.sql` snapshots. They can replace hardened functions or grants. The new migration contains ordinary `CREATE TABLE`, `CREATE FUNCTION`, `CREATE POLICY`, and `CREATE INDEX` statements and is intended to run **once through tracked migrations**, not as an arbitrarily repeatable SQL paste.

Before an authorized rollout, inspect the target project's migration history and schema drift, retain a recoverable backup, and rehearse the complete chain on an isolated staging copy. This migration assumes Supabase's `auth.users`, `auth.uid()`, `anon`, `authenticated`, and `service_role` roles. It needs the existing functions and tables supplied by all four preceding migrations. Review index creation and table-lock impact against the size of the actual project; the new indexes are not created concurrently.

Apply the database migration before releasing either application that calls its tables and RPCs. Then release the compatible Render API and Next frontend together, verify the configured origins and JWT flow, and run authenticated smoke tests with two staging accounts. Keep production migrations, deployments, and user-data changes behind the project's separate explicit authorization. No destructive reset, schema-repair command, production import, or down migration is required by this implementation.

For an already linked, deliberately selected staging project, the existing migration review commands are `npx supabase migration list` and `npx supabase db push --dry-run`. Inspect their target and output before any separately authorized apply. The actual apply command and hosted provisioning procedure remain in the root migration guide. This document does not authorize running them against production.

## Configuration ownership

| Deployment | Configuration | Purpose |
| --- | --- | --- |
| Vercel Next build/browser | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing Supabase authentication; public keys remain subject to RLS. |
| Vercel Next build/browser | `NEXT_PUBLIC_SPEAKWISE_API_URL` | HTTPS origin of the Render service. Changing it requires rebuilding the frontend. |
| Vercel Next server | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server-only database access after verifying the request's actual user. Never expose the service key through a public environment variable. |
| Vercel Next server | `SUPABASE_ANON_KEY` or the existing public anon-key fallback | Auth token verification against the same project's `/auth/v1/user`. |
| Render Python | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | The same project, with each request's exact user JWT for storage and retrieval. Render does not require a service-role key. |
| Render Python | `OPENAI_API_KEY`, optional `OPENAI_CHAT_MODEL`, optional `OPENAI_TTS_MODEL` | Server-side tutoring, scripts, source coverage processing, and existing speech. |
| Render Python | `SPEAKWISE_CORS_ORIGINS` | Exact allowed Vercel/custom-domain origins, including any deliberate staging frontend. |

The browser sends its current bearer token to both applications. A model action never carries a trusted user identity. Next verifies the token before selecting a user ID for a privileged call; Render verifies it and uses RLS plus explicit owner filters.

No second database, vector service, public bucket, persistent Render disk, or background queue is required. PDF parsing stays in a bounded Python worker on Render. Uploaded PDF bytes are discarded after native extraction; private extracted pages are stored in Supabase. OCR is not configured. The Vercel configuration explicitly includes the existing `public/vocabstream/data/**/*` catalog in the SpeakWise learning and VocabStream review functions so both use the same shipped vocabulary.

## Additive schema

| Record | Purpose and identity | Important limits/provenance |
| --- | --- | --- |
| Existing `speakwise_lesson_sessions` | Adds `status`, `state`, `elapsed_seconds`, `updated_at`, `completed_at`. Existing session UUID remains canonical. | Status is `active`, `interrupted`, or `completed`. State holds selected resource IDs, setup, and UI recovery state. API saves are bounded; elapsed time can only increase within a session. |
| Existing `speakwise_lesson_summaries` | Adds `schema_version` and `summary_status`. | Historical rows remain version 1 / `legacy`. A partial unique index permits one version-2-or-newer summary per owned session. |
| `speakwise_lesson_messages` | Immutable transcript records by message UUID, session UUID, and owner. | Role is user or assistant; content is 1–24,000 characters. Metadata has a 24,000-byte database limit and carries input method, source/request context, citations, prompt version, and inferred observations where applicable. |
| `speakwise_learning_events` | Timestamped activity evidence by event UUID, session, and owner. | Separate impression, selection, opening, dismissal, reveal, vocabulary-attempt, and comprehension-response event types. Payloads are bounded to 12,000 database bytes. |
| `speakwise_documents` | Private extracted PDF pages, filename, SHA-256, status, warnings, and page count. | Database ceiling: 300 pages and 6,000,000 bytes of page JSON. The Python API deliberately enforces lower operational limits: 8 MiB input, 80 pages, 180,000 total extracted characters, and 24,000 characters per page. |
| `speakwise_scripts` | Reusable reading artifact with title/body, kind, source references, generation settings, questions, vocabulary, and prompt/schema versions. | Unique `(user_id, request_id)` makes retries reuse the artifact. Body is capped at 20,000 characters. Kinds distinguish excerpt, adaptation, and original. |
| `speakwise_learner_profiles` | Confirmed preferences, `memory_enabled`, `memory_reset_at`, version, and update time. | Preference JSON is bounded. Supported API keys are goals, interests, target language, and correction style. Confirmed preferences do not decay. |
| `speakwise_vocab_cards` | Saved exercise snapshot referencing a canonical VocabStream sense/lesson. | Owned session and card UUID; no duplicated shared vocabulary catalog. Database card limit is 14,000 bytes. |
| `speakwise_personal_vocabulary` | Learner-confirmed noncatalog words kept private. | Unique owner/word/language; definition and example stay separate from shared catalog entries. These do not receive invented distractors or silently become shared content. |
| `vidmatch_text_content` | Shared, reviewed text catalog for articles, news, websites, and blogs. | Stable UUID, unique HTTPS URL, source, actual body when available, language, level, topics, word count, and dates. The migration creates **no content rows**. |
| Existing `vocabstream_question_attempts` | Adds `hint_used` and optional `speakwise_session_id`. | SpeakWise attempts remain canonical VocabStream evidence. Existing rows are retained. |

Owner/session ordering indexes support transcript and activity recovery. GIN indexes support lexical summary/event search and English-stemmed catalog title/body search. The implementation uses no embeddings or separately maintained vector index. PostgreSQL indexes update transactionally with source rows.

## Ownership and database access

Every new private table enables RLS and permits authenticated users to read only their own rows. Anonymous users receive no access. Application paths that use `service_role` explicitly scope every private query by the authenticated owner; RLS is not used as a substitute for those checks.

Render can insert/update its authenticated user's documents and scripts and append that user's messages. The database owner trigger verifies linked-session ownership, locks the parent session, rejects new messages/events/cards on closed sessions, and rejects scripts linked to a reset session. Script references to private documents must resolve to that same owner. Direct authenticated document deletion is revoked; the cleanup RPC removes the document and its derived scripts together.

Authenticated users can read the shared text catalog, eligible video metadata, and available transcript records/chunks. These are catalog sources, not another learner's documents. No direct authenticated catalog writes are granted. Next search additionally requires active, editorially reviewed videos with unexpired provider metadata. A metadata caption flag is never treated as proof that transcript chunks exist.

Authenticated append access means transcript text and assistant-labelled rows are not a cryptographically attested assessment channel. Conversation corrections are therefore bounded, traceable **model inferences**, not scored mastery. The service-only vocabulary RPC independently derives correctness from a saved canonical card; browser-supplied correctness and arbitrary scored activity events are rejected.

## RPC contracts and idempotency

| Function | Caller and transaction boundary | Retry behavior |
| --- | --- | --- |
| `save_speakwise_session_state(user, session, messages, events, state, elapsed)` | Service-role-only. Locks and verifies the active owned session, validates selected private source IDs, appends bounded message/self-report batches, and merges state. | Existing message ID must retain owner/session/role/content. Existing event ID must retain type and payload. Exact retries do not append another record. Metadata is preserved from the original message. |
| `record_speakwise_event(user, session, event, type, payload)` | Service-role-only. Active-session lock; used for confirmed recommendation impressions and content selection. | Same ID and payload return without another event; conflicting reuse fails. |
| `answer_speakwise_vocabulary(user, session, card, attempt, answer, hint)` | Service-role-only. Serializes the learner's canonical vocabulary writes, checks card ownership and choices, writes one lesson-attempt/question-attempt/activity, and updates shared review records in one transaction. | Stable attempt ID returns the prior outcome. Changed answers, owner, card, or reported hint state fail instead of recounting. |
| `complete_speakwise_session(user, session, summary)` | Service-role-only. Locks the owned session and compares the supplied summary's message/event IDs with the complete saved record set. | Concurrent record changes cause a retryable completion failure. A previously finalized version-2 summary is returned unchanged. Closed/reset sessions cannot be finalized again. |
| `retrieve_speakwise_memory(user, query, since)` | Service role or authenticated Render JWT. Checks JWT identity inside the function and enforces the profile's reset boundary and memory-enabled setting. | Read-only; no derived progress counters or private shared cache. Foreign-user requests return empty evidence. |
| `search_speakwise_catalog(user, query, level)` | Service-role-only; searches actual catalog/transcript tables and includes actual prior video-opening evidence. | Read-only. The application separately records a confirmed impression using an event UUID. |
| `reset_speakwise_memory(user, scope)` | Service-role-only, invoked only by the authenticated learner's explicit control. Locks owned sessions before deleting/resetting records. | Another reset moves the boundary forward; it cannot duplicate progress. It is destructive to the selected learner's specified SpeakWise evidence, so the UI explains the scope. |
| `delete_speakwise_document(document)` | Authenticated Render JWT; identity comes from `auth.uid()`, not a supplied user parameter. | Deletes the owned source, directly derived scripts, and matching active source selections atomically. Already-absent/foreign IDs are unavailable. |

`check_speakwise_record_owner` and `speakwise_query_terms` are internal trigger/search helpers. The established VocabStream and VidMatch RPCs remain in place. A saved `source_opened` video event updates existing VidMatch open history once when the video remains eligible. Selection or an impression alone does not increment open history or demonstrate comprehension.

A correct hinted answer remains an attempt; it is not reported as unaided strength. A recorded answer reveal forces the effective hint flag even if the browser later reports `false`. A wrong answer updates `vocabstream_user_mistakes` using its existing source-category/word key. Three latest unaided correct SpeakWise attempts for that word/category can remove it from the active review queue; all canonical question history remains. This is a conservative review-queue rule, not proof of lasting mastery or a spaced-learning benefit. A single in-lesson card does **not** write a completed standalone lesson into `vocabstream_user_lesson_progress`.

## Summaries, retrieval, and interrupted lessons

The Next session reader paginates authoritative messages/events in chronological order. It does not summarize only the visible chat window. Above its explicit 10,000-record bound it fails rather than claiming that a truncated transcript was complete. Finalization compares exact evidence IDs under the session lock; parent-row locking also serializes new Render assistant-message inserts with completion.

A provisional summary is computed when reopening an unfinished session. It is not persisted as a finalized outcome. The finalized version-2 summary records actual activities/resources, scored vocabulary outcomes, grounded inferred corrections, source message/event IDs, suggested next steps, and uncertainty. Quoted text, prior assistant examples, and speech-recognition input do not establish conversational mistakes. Unscored open-ended comprehension responses remain labelled unscored. Showing a correction or opening a resource is never labelled improvement.

An ordinary disconnected active session remains recoverable from saved records; no browser-unload write is required. Summary failure leaves records available for another completion request. Reset sessions become interrupted and reject delayed append attempts. There is no scheduled job that guesses completion for abandoned lessons.

Personal-memory retrieval and source-content retrieval are distinct. Personal retrieval first searches the full owned PostgreSQL corpus, then bounds candidates to 60 summaries, 100 events, 100 weak-word records, and 200 canonical attempts. Canonical attempts are drawn from the latest eight per word/category before final candidate limiting. Ranking considers current-task lexical relevance, evidence confidence, recency, and recent unaided successes/failures. Recovery is applied only when the word/category provenance matches; legacy records with unknown senses do not receive invented recovery evidence. Next's selected evidence text budget is 12,000 characters; Python independently bounds its conversation/source prompt context and reports excerpts/omissions.

Catalog search uses English stemming and an OR query over bounded lexical terms, so a conversational query is not an all-words-must-match filter and `garden` can retrieve `gardens`. The catalog RPC returns up to 60 video and 60 text candidates. Application ranking adds actual level/interest/time/availability/prior-exposure evidence, source diversity, and recent dismissal exclusions. Text and video metadata-only cases remain actionable but cannot ground detailed source teaching until a body/transcript exists. Catalog language search is currently tuned for English; a general multilingual semantic search system is not implemented.

## Reset and deletion semantics

The API control is `DELETE /api/speakwise/learner-memory` with `scope: "derived"` or `scope: "all"`. These are **SpeakWise scopes**, not account deletion or deletion of every product's progress.

| Data | `derived` | `all` |
| --- | --- | --- |
| SpeakWise saved transcript, learning events, summaries, mistake patterns | Delete | Delete |
| Selected session state | Clear; unfinished sessions become interrupted | Same |
| Confirmed learner-profile preferences | Preserve | Clear |
| Profile version/reset timestamp | Advance | Advance |
| Documents, saved scripts, private vocabulary, saved cards | Preserve | Delete |
| Session headers, timestamps, planned settings used by analytics | Preserve | Preserve |
| Existing `speakwise_lesson_settings` | Preserve | Preserve |
| Canonical VocabStream attempts/progress/review records | Preserve | Preserve |
| Existing VidMatch opening history | Preserve | Preserve |
| Shared VidMatch and VocabStream catalogs | Preserve | Preserve |

Personalization excludes preserved older cross-app evidence at or before the reset boundary. New activity can become eligible again. No profile/retrieval cache requires a background rebuild. Existing standalone VocabStream review still uses its canonical records, which the SpeakWise reset deliberately does not erase.

Deleting one PDF additionally deletes saved scripts that directly reference its document ID and clears their active selections. Existing conversation quotations and summaries are separate lesson history and are **not** erased by a PDF-only delete. The broader memory controls are required to remove that lesson history. Files in database backups or exported administrative snapshots follow their own retention policy; application deletion cannot erase an external backup.

## Legacy evidence and remaining operational limits

No richer lesson observations are fabricated from old summaries. Historical summaries retain version 1 / `legacy`, have reduced retrieval confidence, and cannot supply missing message IDs, source citations, hint use, or completed-activity evidence. Existing question rows receive the schema default `hint_used=false`; that default is a compatibility value, not proof that no hint was used in a historical lesson. Fine word-sense identity is incomplete in older canonical records, so grouping by word/category cannot distinguish every historical sense.

The migration's session status default is `active` for preexisting rows. Those rows often contain only setup/analytics and no recoverable transcript. Do not interpret that default as proof that the old session is ongoing, completed, or resumable with historical content. Review a staging account with legacy history during adoption rather than backfilling invented outcomes.

Profile updates and mutable session-state selections are last-writer operations. They do not currently enforce an optimistic revision precondition across multiple browser tabs. Immutable messages, stable request context, and scored attempts have stronger retry guarantees, but concurrent edits to preferences or selected UI state can overwrite each other. Hosted testing with separate connections remains necessary for lock contention and cancellation races.

The shared text table is empty until a separately reviewed import supplies legitimate URLs, source metadata, and extracted bodies. This work adds the real read/search path, not an automated web crawler or a fabricated catalog. Private learner words have persistence without automatic shared publication or fabricated quiz choices. No scheduled memory-consolidation job, external embedding service, or production semantic-ranking quality claim is included.

## Verification and recovery

Local deterministic checks are available through:

```sh
npm run test:backend
npm run test:speakwise-api
PGLITE_MODULE=/path/to/isolated/node_modules/@electric-sql/pglite/dist/index.js npm run test:speakwise:sql
PGLITE_MODULE=/path/to/isolated/node_modules/@electric-sql/pglite/dist/index.js node --experimental-strip-types scripts/evaluate-speakwise-retrieval.mjs /tmp/speakwise-retrieval-results.json
```

The isolated PGlite harness executes the actual migration SQL, RPC transactions, grants, and RLS using synthetic accounts and minimal Auth fixtures. It tests owner injection, duplicate progress, complete-summary evidence, reset boundaries, and relevant history older than 1,100 newer records. The HTTP workflow harness runs actual Next/Python application code against a local PostgREST-shaped adapter and deterministic provider responses. These are not hosted Supabase Auth/PostgREST, paid model, email, or production-user tests. PGlite uses a single serialized connection and does not validate independent concurrent connections. The test harness omits the `CREATE EXTENSION pgcrypto` statement because core UUID support is available and the unused extension package is not bundled in PGlite.

Before a hosted release, verify the real migration/grants under two distinct JWTs, persisted PDF/script ownership, repeated attempt and completion requests after dropped responses, cross-app review, source deletion, reset boundaries, and concurrent save/finalization behavior in staging. Verify deployment tracing includes the canonical vocabulary JSON. Missing tables/functions or stale schema-cache exposure must produce visible errors; do not substitute local-only success messages for unavailable hosted writes.

Prefer an application rollback or a small forward repair over dropping the added schema. The migration adds tables/columns and retains existing rows/functions, so an older application can generally coexist with the additions, but it will not provide the new workflows or evidence contract. Retain the added records during rollback; do not mark migrations applied without executing them, rerun old snapshots, or drop learner tables to make a deployment pass.

For a failed tracked migration, inspect migration history and actual objects to determine whether its transaction committed, then correct the cause in a staging copy before a reviewed retry or forward repair. For a failed session write or completion, reuse its existing IDs and preserve saved evidence; creating replacement IDs defeats idempotency. For accidental user deletion, recovery requires an authorized backup restore/export procedure with explicit scope and replay checks. Do not silently restore deleted memory or reset its deletion boundary, and do not overwrite unrelated newer progress while recovering one learner's records.
