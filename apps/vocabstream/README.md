# VocabStream

VocabStream runs inside the root Next.js application. Static lesson JSON in `public/vocabstream/data/<course>/Lesson<N>.json` feeds the shared learning engine, cards and review service. Start from the repository root with `npm run dev`.

## Curriculum and stable identity

- Word courses retain their original 100 lessons each, ordered entries, spelling and level labels: beginner A1–A2, intermediate B1, advanced B2, proficiency C1–C2.
- Genuine expression courses display **Lessons 1–10**, 100 expressions per level. Their unchanged internal lesson addresses are 51–60 in the existing `idioms-*` categories. `displayLessonNumber` and `lessonLabel` keep user-facing numbering separate from persisted identity. Previous lessons 1–50 were repeated placeholder vocabulary; they remain reachable through “以前のレッスン・学習記録を見る” and are labeled “以前の Lesson N” to distinguish their history.
- Specialist courses have eight ten-word lessons each (80 terms per field): `specialized-it`, `specialized-engineering`, `specialized-healthcare`, `specialized-business`, `specialized-environment`, `specialized-academic`.
- Persisted lesson identity is `<course>-lesson-<N>`, **not** the legacy JSON `lesson_id`. Mistake identity is user + source category + lowercased word. Do not rename words, shift lesson positions, or repurpose old lesson numbers.
- `scripts/vocabstream-baseline.json` freezes all 600 original files' IDs and ordered word strings. Append new lessons; do not regenerate this baseline to make a compatibility failure disappear.

## Authoring and review

`src/lib/content.ts` defines the backward-compatible schema. Every item retains `word`, plain-English `meaning`, `japaneseMeaning` and a natural `example`. Optional fields include `usageNote`, `expressionType`, `domain`, `duplicateOf` and:

```json
{
  "definitionType": "text",
  "meaningDistractors": ["banana", "carrot"],
  "sentencePractice": {
    "prompt": "A reviewed sentence with exactly one ____ blank.",
    "distractors": ["first alternative", "second alternative"],
    "reviewNote": "Explain why neither completed alternative works in this context."
  }
}
```

The example above demonstrates the shape only; it is not publishable content. For each real exercise, substitute **all three options**, read the complete sentences, and confirm that only the intended answer is reasonable. Do not put synonymous options together. Match part of speech and learner level where practical. A review note is editorial evidence, not an automated proof of correctness.

Unreviewed examples remain on study cards and available for browser speech synthesis. They are **not automatically converted to scored gaps**. This prevents random same-lesson distractors, partial-word blanks and invented gaps. Meaning questions use explicit pairs when supplied; the older fallback excludes duplicate labels, identical meanings and listed synonyms. It cannot recognize every semantic relationship, so new content should include reviewed explicit pairs.

The beginner course contains 70 illustrated entries, covering food, everyday objects, clothing, animals, vehicles and nature. Images are selective: use them for an unmistakable concrete sense, not abstract relationships or ambiguous scenes. `image+text` combines local artwork with a short definition. Image questions show the illustration first, with Japanese accessible descriptions and a text fallback. See [image attribution](../../public/vocabstream/images/ATTRIBUTION.md) and `manifest.json`. Optional image data must include dimensions, source, source URL, creator and license. The current renderer accepts local `/vocabstream/images/` assets; external image services are unnecessary.

## Quality checks

Run with the Node version in `package.json` (Node 22.18+):

```sh
npm run vocabstream:audit
npm run vocabstream:ambiguity -- --output /tmp/vocabstream-ambiguity.json
npm test
npm run typecheck
npm run lint
npm run build
```

The production build runs both audits automatically before Next.js compiles. The dataset audit checks every entry, original identities, required fields, images/provenance, option structure and canonical references. The ambiguity report exports all completed sentences; `unique_answer: null` means static checks cannot certify semantic uniqueness. `--include-study` also lists unscored examples awaiting review. Automated checks supplement curriculum review.

Browser fixtures use the existing external Playwright/Axe tool installation:

```sh
FLUENCE_BROWSER_TOOLS=/path/to/browser-tools \
FLUENCE_BASE_URL=http://127.0.0.1:3136 \
FLUENCE_SUPABASE_URL=http://127.0.0.1:3137 \
node scripts/validate-vocabstream-curriculum.mjs
```

Use a local build configured with the same dummy public Supabase URL. The script intercepts authentication and application API calls; its saved-progress assertions are browser fixtures. `scripts/validate-vocabstream-api.mjs` exercises real local Next routes against an isolated HTTP service fixture. `scripts/validate-database.mjs` exercises the actual PostgreSQL functions and RLS through PGlite; see its `PGLITE_MODULE` requirement. No hosted credentials are required for these checks.

## Deployment and progress storage

This curriculum update needs **no new database migration, image bucket, secret, provider account or worker**. Deploy the branch's Next.js application and its `public/` files together. New specialist categories and appended expression lesson numbers use the existing progress API and atomic save function. Saved attempts keep their original contents; review displays corrected current content only when the exact source lesson can be resolved, otherwise it keeps the historical text without borrowing another sense's image or questions.

For a new environment, complete the branch's existing [production deployment guide](../../docs/production-deployment.md), including its Supabase migration sequence and authentication URLs. Do not run the old application `schema.sql` as a replacement for the root migrations. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Nothing in this update applies hosted migrations or changes existing learner records.

See [the expansion report](../../docs/vocabstream-expansion.md) for current counts and validation, and [the initial curriculum audit](../../docs/vocabstream-curriculum-audit.md) for the original findings and progress-compatibility design.
