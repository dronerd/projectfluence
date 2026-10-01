# SpeakWise prompt and action audit

Audited 2026-10-01 against the implementation in this checkout. The current lesson
uses `/api/learning/chat`, persisted session records, explicit source IDs and real
application actions. Compatibility endpoints remain available, with the narrower
guarantees below. No live OpenAI or Render prompt-quality validation was performed.

## Versions and ownership

- Shared Python policy: `speakwise-learning-2026-10-01.1` in
  [`prompts.py`](../api/speakwise/prompts.py). Saved Python artifacts/turns use schema 1.
- Authoritative Next lesson summaries: schema 2. Memory ranking/evidence policy:
  `lexical-recency-evidence-v1` in
  [`learningPolicy.ts`](../app/api/speakwise/learningPolicy.ts).
- Model JSON is parsed through bounded Pydantic contracts in
  [`learning.py`](../api/speakwise/learning.py). The model cannot select a user,
  table, arbitrary URL, SQL expression or unrestricted database write.
- Supabase Auth, ownership filters, RLS and transaction functions enforce access.
  Source instructions and model compliance are never authorization controls.

## Prompt families and actual enforcement

| Family / location | Current behavior and enforced boundary | Verification and limits |
| --- | --- | --- |
| Setup and initial lesson — `AI_chat.tsx`, session/profile APIs | The learner selects mode, level, target language, time and topics. Saved state/profile remains separate from inferred memory. Startup text requests a greeting or direct start; the backend supplies the persisted mode and timing. | HTTP/browser fixtures verify setup, saved state and refresh. There is no autonomous multi-week curriculum planner or inferred preference promoted to a confirmed profile. |
| Shared tutoring — `TUTOR_POLICY` | Target-language/CEFR/goal/time rules, one task and at most two corrections, explicit uncertainty, no mastery from exposure, no acoustic judgments from text. Sources/memories/conversation records are untrusted data. | Policy-presence and request-context tests pass. Actual linguistic level, teaching quality and consistent correction restraint require live-model evaluation. |
| Eleven mode workflows — `LESSON_MODE_PROMPTS`, `/api/learning/chat` | A closed mode enum selects a trusted workflow appended to the tutoring policy. Persisted elapsed/planned time produces remaining minutes; the policy requests a short wrap-up near the end. | One API regression loops all 11 workflows, checks their inclusion and saved timing, and rejects an unknown mode. Mode-specific teaching quality is not established by a fixture. |
| Task-aware personal memory — `learner_context`, shared retrieval RPC | Confirmed preferences, recent/relevant conversation, dated historical summaries and canonical vocabulary outcomes remain distinct. Disabled/reset memory is excluded before generation. Recovery uses the same word **and source category**; legacy unknown senses do not acquire guessed recovery. | Tests cover an older relevant weakness beyond 80 newer irrelevant rows, subsequent success, cross-sense isolation and future-dated exclusions. SQL tests exercise retrieval/ownership. No embeddings, reranker, learned mastery estimate or scored grammar-recovery model is claimed. |
| PDF/article/transcript grounding — `GROUNDED_CHAT_POLICY`, `source_context` | The application retrieves owned pages or real indexed catalog content. Model source IDs must match supplied evidence. Page/timestamp excerpts come from those records. Missing text returns a deterministic application fallback without asking a model to invent it. | Real native final-page extraction and mocked-provider API tests pass; fixture HTTP/browser paths also exercise sources. A valid citation identifies real supplied evidence but does not prove every generated sentence is entailed by it. |
| Whole-source coverage — `COVERAGE_POLICY`, `cover_all_passages` | Every readable passage enters direct context or bounded map batches. Each map must return all supplied source IDs; omitted IDs, deadlines and excessive notes fail explicitly. Generated page notes are labelled paraphrases. | Regression verifies every passage is processed and missing IDs fail. Figures, scan-only pages and table layout remain uninterpreted; coverage receipts are not a semantic completeness proof. |
| Catalog query/action selection — structured action union | The model can propose bounded `search_content`, `practice_vocabulary` or `create_script` arguments. The application executes authenticated APIs and displays real cards/activities/artifacts. Pending proposals use application-written language, not a claimed completed search/save. | Invalid tool/identity arguments, unsupported source IDs, obvious false-success language and failed writes are rejected. Lexical/content ranking is application code, not a separate query-generating agent. The model's choice of useful query still needs live evaluation. |
| Reading script and comprehension — `SCRIPT_POLICY`, `ScriptOutput` | Selected settings include language, level, topic, length and vocabulary. Artifacts distinguish original/adaptation/excerpt and persist references/settings/questions. Faithful excerpt text is copied by application code; generated adaptations require valid source IDs. Open answers are saved separately from scored attempts. | Save/reopen/retry/ownership tests pass. JSON validation does not prove CEFR accuracy, exact word count, factual entailment or question quality. Reference answers are aids; open comprehension answers are not automatically certified correct. |
| In-lesson vocabulary — canonical VocabStream question policy | Exercise choices, definitions, examples, eligible images and scoring reuse the canonical catalog and review contracts. Correctness/hints are recorded transactionally; an answer reveal or resource impression does not count as recall. | SQL/API/browser tests check a real interactive card, shared attempts, duplicate prevention and hint/recovery behavior. These exercises are deterministic catalog workflows, not model-authored flashcards. Unknown words require learner-confirmed private definitions. |
| Conversation corrections — optional `observations` | At most two grammar/vocabulary/expression suggestions reference exact saved learner-message substrings. Source copies, assistant examples, quoted input and speech-recognition messages are excluded. Records explicitly say `model_inferred`, with confidence 0.6. | Substring/source/quote/ASR exclusion tests pass; summary code rechecks evidence references. Corrections are tentative suggestions, not demonstrated improvement or pronunciation judgments. |
| Authoritative lesson summary — `evidenceSummary`, completion RPC | A deterministic summary reads saved messages/events, separates observed attempts from inferred corrections, lists resources and uncertainty, and keeps recommendations future-facing. Completion is atomic/idempotent; recovery summaries remain provisional. | Real SQL/fixture HTTP tests cover completion, retry, evidence mismatch and rejecting browser-invented summaries. The recap is intentionally structured; it is not an unrestricted model narrative about everything the learner understood. |
| Legacy conversation/summary — `main.py` builders, `/api/chat`, `/api/lesson-summary` | Shared policy hardens compatibility prompts. Legacy chat still uses bounded browser history; legacy summaries are marked provisional, omit invented default strengths, and cannot be submitted to current summary persistence. | Existing compatibility tests pass. These routes are not the durable source/action workflow and retain smaller history limits. Legacy response shapes are not retrofitted with every new schema field. |
| Legacy feedback/rewriting — feedback and improved-version builders | Shared policy instructs targeted, meaning-preserving feedback. Text-only pronunciation output is removed by application code; malformed feedback returns an error. Rewriting has one bounded fallback. | Existing error/normalization tests and shared-policy tests pass. General encouraging fallback wording remains in the legacy feedback formatter; it is not longitudinal evidence. Live rewrite quality is unmeasured. |
| Speech / reading aloud — `/api/voice` | Sends bounded text to the configured speech model without judging pronunciation. Streaming/Blob fallback, playback failure and cancellation use the existing audio path. | Mocked upstream streaming/cancellation tests pass. Real voice quality, autoplay and physical mobile behavior remain external checks. No server speech-to-text or acoustic assessment model was added. |

The accepted mode IDs are `natural_conversation`, `vocabulary_phrase`,
`grammar_practice`, `speaking_practice`, `pronunciation_practice`,
`listening_practice`, `reading_comprehension`, `pdf_reading`, `writing_feedback`,
`deep_discussion` and `review_weakness`.

The retained frontend `openingQuestions.ts`, `lessonGreetings.ts` and
`promptMemory.ts` are compatibility assets/helpers; the current `AI_chat.tsx` does
not import them for the new persisted learning flow. Their presence does not
establish another active memory pipeline.

## Test interpretation and remaining review

Run `npm run test:speakwise-api` for 31 Python regressions, `npm run test:backend`
for shared contracts/evidence policy, and the SQL, HTTP and browser commands in
the [API README](../api/speakwise/README.md#local-verification). The labelled
retrieval fixtures compare ranking behavior; they do not measure human learning.

Prompt-injection tests show that unsupported model actions/citations cannot pass
application contracts and that protected data is filtered before generation.
They do **not** prove that a real model will always ignore adversarial source prose.
False-success regexes are an additional conservative guard, not an exhaustive
semantic detector across every language. Inspect representative live outputs for
source faithfulness, actionable difficulty, uncertainty, tool choice and correction
quality before describing these properties as production-verified.

The implementation has no general tool loop: each response proposes at most one
allowlisted action, with a stable operation ID and visible application result.
Whole-source mapping and provider fallback calls have explicit limits; failing
generation or persistence is not represented as successful learning progress.
