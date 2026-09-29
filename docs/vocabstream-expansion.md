# VocabStream curriculum expansion

This extends the initial VocabStream update in `3b5cc04` on `codex/vidmatch-curated-catalog`. Deploy the Next.js application and its public files together. No new database migration, environment variable, storage bucket or provider account is needed.

## Idioms start at Lesson 1

Current idiom courses display **Lessons 1–10** in their lists, lesson headings, review-word labels, and newly saved lesson titles. The corresponding internal addresses remain `idioms-<level>-lesson-51` through `-60`. Static JSON titles also use the displayed number. Old bookmarks and existing progress continue to resolve to the same content.

Previous placeholder lessons retain their original addresses and records under “以前のレッスン・学習記録を見る.” They display “以前の Lesson N,” which distinguishes them from the new curriculum. No old score is reassigned to a new lesson. The shared `displayLessonNumber` / `lessonLabel` helpers are presentation rules; they must never be used to construct a progress ID or source lesson number.

## Content expansion

| Course | Previous current entries | Added | Current entries | Current lessons |
|---|---:|---:|---:|---:|
| Idioms beginner A1–A2 | 50 | 50 | 100 | 10 |
| Idioms intermediate B1 | 50 | 50 | 100 | 10 |
| Idioms advanced B2 | 50 | 50 | 100 | 10 |
| Idioms proficiency C1–C2 | 50 | 50 | 100 | 10 |
| IT / computers | 30 | 50 | 80 | 8 |
| Engineering | 30 | 50 | 80 | 8 |
| Healthcare | 30 | 50 | 80 | 8 |
| Business / economics | 30 | 50 | 80 | 8 |
| Environment | 30 | 50 | 80 | 8 |
| Academic English | 30 | 50 | 80 | 8 |

The expansion adds **500 entries in 50 lessons**, bringing the current expression and specialist curriculum to **880 entries**. Retained historical idiom scaffolds are not counted as new expression content. The complete on-disk corpus contains 688 lessons and 6,879 entry occurrences, including archives.

New expressions extend everyday interactions, study, relationships, work and discussion. Specialist additions cover practical concepts such as account access and service operations; drawings, materials and machinery; healthcare communication; payments and project management; water, ecosystems and energy; and academic reading and research.

Every added entry includes a plain-English definition, Japanese meaning, natural example, and explicit meaning distractors. New sentences are scored only when an author has supplied a reviewed gap, two alternatives, and a reason. Definitions, examples, and answer alternatives received a second coding-agent editorial pass. This is not independent educator validation or calibrated CEFR certification.

The new lessons add **100 reviewed sentence exercises** (40 idiom and 60 specialist), bringing the full curriculum to **180**. Review tightened ambiguous contexts and overlapping alternatives, including `calm down` / `cheer up`, `break even` / `make ends meet`, a wound/fracture overlap, and the multiple senses of `moot point`. Less useful new idioms were replaced with `take stock of` and `gain ground` before publication. All 400 current idiom headwords are distinct across the four levels; each specialist course has 80 distinct headwords. Shared terms across specialist fields can remain when the field-specific sense is useful.

Technical spot-checks used primary references: [NIST authorization](https://csrc.nist.gov/glossary/term/authorization), [NCI benign](https://www.cancer.gov/publications/dictionaries/cancer-terms/def/benign) and [acute](https://www.cancer.gov/publications/dictionaries/cancer-terms/def/acute), the [USGS water glossary](https://www.usgs.gov/water-science-school/science/water-science-glossary), and the [ASA statement on p-values](https://www.amstat.org/docs/default-source/amstat-documents/p-valuestatement.pdf). These support selected terminology checks, not external certification of the entire curriculum. Healthcare examples describe language use and do not prescribe treatment.

## More beginner illustrations

Added **40 original illustrations**, bringing beginner image-and-text entries from 30 to **70 across 17 lessons**. The additions cover animals, clothing, everyday objects, kitchen utensils, transport and nature. Examples include cat, rabbit, turtle, trousers (`pants`), umbrella, wallet, oven, camera, leaf and ambulance.

Selection follows the actual lexical sense. For example, the dataset teaches `circle` as a verb and `square` as a town square, so a simple geometric shape would misrepresent those entries. Abstract concepts remain text-based. Images supplement existing definitions and examples rather than replacing usage practice.

All illustrations are local SVG files using the existing image component and image-to-word exercise. They retain Japanese alternative descriptions, intrinsic dimensions, failure fallbacks, and original-artwork CC0 provenance in the manifest. There are no new image-service requests or external hotlinks. The complete 70-image set is approximately 65 KB.

## Compatibility and quality controls

All 638 previously present lesson files retain their lesson identifiers, ordered headwords and course membership. No original vocabulary entry was removed or moved. Existing current idiom titles were normalized for display; progress IDs, source numbers and historical attempts were not migrated or rewritten.

Tests verify consecutive displayed numbering while keeping current and archived identities separate. The full-corpus check now rejects duplicate headwords in each current expression/specialist course and verifies that explicit meaning choices work against the complete course pool used for review, as well as within lessons. It also checks that all 70 illustrations actually produce image questions. Existing build-time dataset and ambiguity audits remain active.

## Validation

| Check | Actual result |
|---|---|
| `npm test` | 108 passing tests: 23 frontend/content and 85 backend |
| Type checking / lint | Both passed |
| Production build | Passed, including dataset and ambiguity audits |
| Dataset audit | 688 files / 6,879 entries, zero errors |
| Sentence audit | 180 reviewed exercises, 6,699 study-only entry occurrences, zero structural errors |
| Previous-content comparison | All 638 prior lesson IDs and 6,379 ordered headwords preserved |
| Isolated PostgreSQL/PGlite checks | 26 passed, including progress writes, idempotent retries and historical-record isolation |
| Actual local API checks | 4 passed; expanded lesson/image content included in review, authorization and progress contracts retained |
| Production curriculum browser suite | 135 viewport/card/question checks, zero Axe violations or horizontal overflow, plus 20 workflow checks |
| Images | All 70 assets loaded and decoded in Chromium; new image answer validation and failure recovery passed |
| Existing vocabulary browser suite | Perfect/final-answer scoring, 95% replay, duplicate-click prevention, focus and responsive-layout checks passed |
| Save/retry browser suite | Session refresh, stable retry identity and guest no-write behavior passed |

Browser checks covered 320, 768 and 1,440 px in the expanded suite, with the existing vocabulary suite also covering widths up to 1,920 px. Current idiom Lessons 1 and 10 and specialist Lesson 8 completed and reloaded their progress in signed-in fixtures. Archived progress remained distinct, and review labels showed the correct current/previous numbering. All 688 lesson JSON files were present in the production review route's file trace. Representative production screenshots and the complete new illustration contact sheet were visually inspected.

The expanded suite initially retained a two-save expectation after a third signed-in lesson case was added. That test expectation was corrected to use the case count, and the complete suite then passed. No application change was needed for that failure. Final browser runs recorded no page errors, unexpected requests or guest writes. Server failures were only the expected invalid-session and invalid-progress fixture requests.

All runtime checks used local dummy credentials, synthetic sessions, HTTP fixtures and isolated databases. No hosted Supabase state was read or changed for validation. The Node direct-TypeScript runner still emits its existing module-type inference warning; lint and the Next.js production build passed.

## Remaining limits

The URL and database lesson numbers deliberately remain stable even where the visible lesson number differs. Renaming those persisted identifiers would require a separate migration and is unnecessary for starting the curriculum at Lesson 1.

Some meaning questions are intentionally straightforward at beginner level. Human teachers and learner trials can further calibrate difficulty. Unreviewed legacy examples remain study content rather than scored sentence gaps. Physical-device Safari/Android checks and live authentication/persistence smoke tests remain deployment steps; isolated local tests do not certify them. No live learner account or hosted database was altered during this expansion.
