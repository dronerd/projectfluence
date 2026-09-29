# VocabStream: 120 specialist terms and 310 new images

This extends `490669b` on `codex/vidmatch-curated-catalog`. As requested, lessons and image metadata remain in the repository, images are local public assets, and Supabase retains learner progress. No deployment configuration, storage bucket, credential, database schema or migration is added.

## Specialist curriculum

| Domain | Added | Total | New lesson coverage | Examples |
|---|---:|---:|---|---|
| IT / computers | 20 | 100 | Data types, database records, user interfaces and support | boolean, validation, tooltip, responsive design |
| Engineering | 20 | 100 | Measurement and design assurance | precision, sampling rate, redundancy, root cause |
| Healthcare | 20 | 100 | Symptoms and medicine terminology | nausea, fatigue, capsule, adherence |
| Business | 20 | 100 | Customer service, logistics and operations | quotation, lead time, reorder point, operating cost |
| Environment | 20 | 100 | Habitats, climate and environmental communication | estuary, canopy, carbon sink, greenwashing |
| Academic English | 20 | 100 | Research data and transparent reporting | codebook, preregistration, meta-analysis, retraction |

Each domain now has ten ten-word lessons. Only Lessons 9 and 10 are appended. Every added term includes a plain-English definition, Japanese explanation, natural example, domain and two explicit meaning alternatives. Each new lesson adds two reviewed sentence questions: **24 additional scored gaps**, bringing the complete curriculum to **204**. Other examples remain study material.

All 120 entries and all 72 completed sentence alternatives received authoring and independent coding-agent review. This tightened contrasts including accuracy/precision, nausea/vomiting, and quotation/receipt. The bruise/wound pair was replaced with rash/fracture to avoid the broader clinical sense of wound. No treatment guidance is introduced.

Selected technical distinctions were checked against primary references: [MDN data types](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Data_structures), [NIST measurement terminology](https://www.nist.gov/pml/nist-technical-note-1297/nist-tn-1297-appendix-d1-terminology), [NASA systems engineering](https://www.nasa.gov/reference/system-engineering-handbook-appendix/), [NCI nausea](https://www.cancer.gov/publications/dictionaries/cancer-terms/def/nausea), [NHS antibiotics](https://www.nhs.uk/medicines/antibiotics/), [NOAA estuaries](https://oceanservice.noaa.gov/facts/estuary.html), and [National Academies reproducibility](https://www.nationalacademies.org/read/25303/chapter/6). These are terminology spot-checks, not external curriculum certification. Definitions and examples are original application content.

## Image expansion

| Course | Existing images retained | New images | Total illustrated entries | Lessons with images |
|---|---:|---:|---:|---:|
| Beginner | 70 | 210 | 280 / 1,000 | 48 |
| Intermediate | 0 | 100 | 100 / 1,000 | 65 |
| Advanced / proficiency | 0 | 0 | 0 | 0 |

The **310 additions are distinct assets**, not alternate URLs or renamed copies. The full catalog has 380 SVG files and 380 distinct content hashes, approximately **598 KB** uncompressed in total. No image downloads are needed at runtime beyond same-origin static requests.

Beginner additions cover objects, food, transport, clothing, body parts, building features, quantities, calendars and spatial relations. Intermediate illustrations cover shapes, quantity, comparison, time, processes, movement and concrete objects. Examples include chopstick, freezer, subway, wrist, proportion, corridor, intersection, sequence and distance.

There are two explicit teaching roles:

- **Meaning images:** 119 new entries (111 beginner, 8 intermediate), plus the 70 existing images. Clear depictions can serve as image-to-word questions. Every illustrated entry has explicit alternatives that work in both lessons and the full course review pool.
- **Supporting diagrams:** 191 new entries (99 beginner, 92 intermediate). Relationships and abstract ideas retain their definitions and text-based assessment. Their diagrams appear on study cards and after an answer, not as an ambiguous standalone picture question. Short Japanese labels help explain relationships or distinguish a specific sense.

Images do not replace example sentences. Sense checks avoided errors such as drawing a circle for the verb `circle`, using a tree branch for an organizational `branch`, or using a noun image for the verb `contract`. Visual review corrected count conservation in a distribution diagram, a washer-like gear, clothing silhouettes, misleading alternative descriptions, and an arrow pointing at the wrong chopstick. The butter image uses bread/soup as alternatives rather than the potentially defensible cheese shape.

All 310 image mappings received authoring and independent semantic/visual review, including comparison with the actual SVG renders. The selection rationale is retained per entry in `public/vocabstream/images/manifest.json`.

## Sources and licenses

The new set contains **238 original ProjectFluence SVGs under CC0**, and **72 unmodified Twemoji SVGs**, pinned to release **v17.0.3**, under **CC BY 4.0**. [Twemoji's official repository](https://github.com/jdecked/twemoji) documents its graphics license; the [CC BY 4.0 license](https://creativecommons.org/licenses/by/4.0/) and full legal text are included or linked in the image catalog.

The original 70 CC0 files remain intact. The global all-CC0 manifest label was replaced with per-image provenance. Twemoji assets are locally hosted and retain release-specific source links, creator, credit, license URL and content hashes. Credits appear on every rendered Twemoji image, including failure fallback, weak-word review and answer summaries. See [the complete image credits](../public/vocabstream/images/ATTRIBUTION.md). No fonts or photos were downloaded.

## Images in review

The shared question builder now carries validated image metadata for meaning and sentence questions. Picture questions display their image before the answer; supporting diagrams and sentence images appear after the answer. The same component powers lesson practice, mistake replay and personal review.

Saved weak-word cards display images with lazy loading. The review result's “今回の回答を振り返る” section also includes each corresponding image. Images use their own aspect ratio, bounded responsive sizing, Japanese accessible descriptions and a text fallback. A failed image does not leave the next word in an error state.

Previously saved mistakes acquire current images by exact course, lesson and headword lookup. Historical entries whose source cannot be resolved retain their saved text; they do not borrow an unrelated illustration. `createAttempt` still writes only the existing progress contract. Image assets, licenses and display roles are not added to learner-progress rows.

## Progress compatibility

A comparison against all **688 prior lesson files / 6,879 entries** confirmed that every existing field, lesson ID, ordered headword, definition, example, synonym and prior image metadata remained unchanged. Only new optional metadata and explicit alternatives were appended to 310 previously unillustrated words. All 48 prior specialist lesson files remain byte-identical.

No words were renamed, moved, removed or re-leveled. New specialist IDs are the appended `<course>-lesson-9` and `-10`; earlier IDs are unchanged. Idioms still display Lessons 1–10 while retaining their internal 51–60 addresses. No progress migration, reset or hosted write was performed. The complete repository corpus now contains **700 files / 6,999 entry occurrences**, including retained archives.

## Quality controls and actual validation

| Check | Result |
|---|---|
| Tests | 112 passed: 27 frontend/content, 85 backend |
| Type checking / lint | Passed |
| Production build | Passed, including all three prebuild audits |
| Dataset audit | 700 files / 6,999 entries; zero errors |
| Sentence audit | 204 reviewed gaps; zero structural errors; unreviewed examples remain unscored |
| Image audit | 380 local files, distinct hashes, matching metadata and valid full-course choices; zero errors |
| PostgreSQL/PGlite | 26 isolated checks passed, including save/retry identity and historical progress isolation |
| Actual Next API routes | 4 checks passed against a local HTTP Supabase fixture; licensed/supporting images hydrate and ownership is enforced |
| Curriculum browser suite | 135 responsive/Axe checks plus 20 workflows; all 380 images decoded |
| New image/review browser suite | 24 responsive/Axe checks across 320, 768 and 1,440 px; new study cards, weak-word cards, picture/text/sentence feedback and result images passed |
| Existing vocabulary suite | Scoring, final-answer save, mistake replay, duplicate-click lock, focus, missing lessons and responsive layout passed |
| Existing save/retry suite | Token refresh, retry identity and guest no-write behavior passed |
| Production packaging | All 700 lesson JSON files present in the review route's deployment file trace |

The new build-time image audit checks exact lesson/manifest agreement, role, license/credit, local existence, SVG safety, bounded file size and content hashes. The dataset audit rejects invalid roles and missing attribution. Tests cover supporting-image timing, historical review hydration, unchanged source identity, and malformed licensed metadata. Automated structural checks supplement the editorial review; they cannot certify semantic uniqueness on their own.

Browser suites recorded no unexpected requests/writes or page errors, and no Axe violations or horizontal overflow. The focused suite initially checked accessibility during streamed navigation before the page title arrived; it now explicitly waits for title metadata. Subsequent complete runs passed without suppressing the accessibility rule. Representative study, review and result screenshots were inspected.

All runtime checks used local dummy credentials, synthetic sessions, intercepted browser APIs or an isolated PostgreSQL fixture. No hosted account, real learner history or production database was used. Physical-device Safari/Android and live production authentication remain deployment smoke tests. Node's existing direct-TypeScript module-inference warning remains informational.

## Deployment

Deploy this branch's Next.js application and `public/` files together using the existing [deployment guide](production-deployment.md). No additional Render/Vercel/Supabase setup is needed for this expansion. Keep the existing Supabase progress migrations and authentication configuration. After deployment, verify a previously saved beginner and intermediate word in both “復習する単語” and “復習,” including a supporting diagram after answering.

Teacher review and learner trials can further calibrate difficulty and visual interpretation. Some diagrams intentionally depend on their accompanying text. The artwork and technical terminology checks are not independent educator or CEFR certification. Future image additions should follow the same exact-sense, accessible-description, provenance and distractor review process.
