# VidMatch: additional 300 videos, 29 September 2026

The existing hosted Supabase catalog was expanded from **190 to 490 unique videos**. The insert-only worker returned 300 insert receipts, and a separate full-row readback confirmed all 300 expected IDs/levels and exact preservation of every field of the original 190 records. No learner data, schema migrations or hosted application deployment were changed.

The durable [import receipt](../apps/vidmatch/catalog/expansion-20260929-additional-300.json) records the exact new IDs and counts without copied provider titles, descriptions, thumbnails, transcripts or credentials. The [editorial manifest](../apps/vidmatch/catalog/reviews.json) preserves the previous 135 reviews in their original order and appends 300 new reviews.

## Resulting library

| Level | Before | Added | After | New channels | New duration min / median / max |
| --- | ---: | ---: | ---: | ---: | --- |
| A1 | 26 | 11 | 37 | 5 | 1:01 / 1:58 / 2:42 |
| A2 | 27 | 43 | 70 | 30 | 1:01 / 2:22 / 9:27 |
| B1 | 37 | 71 | 108 | 58 | 2:02 / 3:17 / 14:15 |
| B2 | 36 | 74 | 110 | 61 | 2:03 / 3:38 / 17:01 |
| C1 | 32 | 76 | 108 | 61 | 2:00 / 4:23 / 8:10 |
| C2 | 32 | 25 | 57 | 22 | 2:22 / 4:20 / 17:44 |

The additions span **191 channels and 293 public publisher reference pages**. Every channel receiving a new video remains at **five or fewer videos within its level**, counting the existing catalog. A1 and C2 additions are smaller because strong whole-video level evidence was scarcer; no harder video was relabelled or weaker item added to force equal counts.

Topic counts below are multi-label counts: one video may contribute to several topics. Formats use the same eleven names throughout the manifest so synonymous labels cannot distort diversity ranking.

| Level | Leading topic coverage among additions | Format mix |
| --- | --- | --- |
| A1 | daily life (9), school (3), culture (2), business (2), travel (2) | storytelling (4), conversation (3), documentary (2), explainer (1), interview (1) |
| A2 | daily life (25), culture (11), school (9), work (8), travel (8) | conversation (9), demonstration (6), explainer (6), storytelling (5), documentary (4), tour (4), vlog (4), interview (2), comedy (2), news report (1) |
| B1 | daily life (22), work (16), society (14), culture (12), psychology (12) | explainer (25), news report (15), vlog (8), interview (8), documentary (4), demonstration (3), talk (3), comedy (2), storytelling (2), tour (1) |
| B2 | society (17), work (17), technology (15), psychology (13), culture (12) | explainer (25), news report (22), interview (10), talk (6), vlog (4), documentary (3), comedy (2), tour (2) |
| C1 | society (22), psychology (18), technology (17), business (15), daily life (14) | news report (21), interview (14), explainer (14), documentary (8), talk (8), demonstration (3), comedy (3), tour (2), conversation (2), storytelling (1) |
| C2 | society (7), business (7), work (6), design (6), technology (5) | explainer (8), news report (8), interview (3), documentary (2), talk (2), tour (1), storytelling (1) |

## Selection and evidence

Discovery used public level-specific publisher references, followed by official YouTube metadata validation. No copyrighted audiovisual files or transcripts were downloaded or redistributed, no paid LLM was called, and no popularity score substituted for educational suitability. Evidence sources were ESL Brains (168 additions), Fluentize (109), Test-English (18), and Cambridge English (5); these are editorial reference publishers, not the 191 video channels.

Each selected video has an exact source link, a supported CEFR range, spoken-English evidence, whole-video teaching coverage, an independent short rationale, topic/format labels and medium qualitative confidence. Current API checks verified public/processed status, embedding permission, no exposed region/age/live restriction, acceptable duration, title/channel/thumbnail metadata and no declared non-English audio. All 300 thumbnail HEAD checks passed before insertion. IDs were deduplicated across existing rows and all research pools.

A second independent source review sampled eight B1–C2 videos. It deferred `WOoJh6oYAXE` after contrary teacher feedback on B1 difficulty, and `EkPZx6hjG7E` because an optional classroom cut omits a profane ending retained by full-video playback. Five otherwise approved C1 candidates were held in reserve to balance the exact 300 additions. Timed excerpts, nonverbal material, primary advertisements, unsupported video mappings and unavailable/non-embeddable sources were excluded earlier.

Representative selections include cafe conversations and favourite school subjects at A1; a narrated Accra tour and everyday office conversation at A2; Icelandic lava-baked bread and personal stories at B1; analysis of AI in film and digital-nomad work at B2; gene editing and critical discussion of technology at C1; and basketball data analysis and crisis leadership at C2. Exact IDs, source URLs and the rationale for each are in the manifest.

**Evidence limit:** publisher CEFR labels describe supported learning tasks. They are not calibrated measurements of unaided listening difficulty. No acoustic assessment, words-per-minute measurement, full listening audit or subtitle-accuracy review was performed. Availability is checked at publication time and may later change by region, account or provider policy. C2 identifies suitability for advanced discussion, not a claim that every sentence has C2 grammar.

## Maintenance and deployment changes

- Import capacity now permits up to 200 total videos per level; the five-per-channel limit and all evidence/playback gates remain unchanged. The default CLI target remains 30, so use the explicit capacity in deployment commands.
- Health maintenance now processes up to 20 purge batches of 50 expired provider snapshots, bounded by its time budget and stopping when empty. This handles a large import’s simultaneous snapshot expiry without unlimited retries or deleting learning history.
- A regression test covers large-catalog channel caps and repeat-run idempotency; retention tests cover an 870-record burst and the 1,000-record run ceiling. The catalog test also enforces consistent format names.
- Node is pinned to `>=22.18 <23` in package and lockfile, matching the tested Node 22 runtime and Render configuration. The committed `.vercelignore` continues to exclude the separate Python service, addressing the earlier Vercel requirements-parser failure.

## Deployment state

The **300 additions are already in Supabase**. The branch has not been merged and no Render/Vercel application deployment or hosted migration was performed. Current local browsing therefore uses the explicit legacy-catalog bridge. Follow the [current deployment walkthrough](deployment-current-setup.md) for the exact commands, environment variables, migration order, authentication URLs and smoke checks.

The final manifest has 435 reviews, of which 434 correspond to hosted rows. After migration, those 434 are eligible for activation subject to fresh provider checks. The remaining 56 original unreviewed rows and their history are preserved but hidden by the new production recommendation filter. One older reviewed candidate remains absent because of its channel cap. Do not enable the new production filters without running the reviewed-manifest activation first.

## Validation

- `npm test`: **115 tests passed** (27 frontend/content, 88 backend), including the final 435-entry manifest and new retention/diversity tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed, including vocabulary dataset, image and ambiguity audit hooks. Node emitted the existing non-fatal module-type warning in the TypeScript audit scripts.
- Local PostgreSQL/PGlite curation integration: **18 checks passed** against the real migration/RPC SQL. This does not simulate concurrent hosted PostgreSQL connections or apply hosted migrations.
- Official catalog CLI: final dry run selected all 300; live insert-only run returned 300 receipts; both had zero provider/editorial/diversity/thumbnail rejections for the selected batch.
- Separate hosted readback: **490 unique rows, 300 exact additions, all 190 prior rows unchanged**.
- Production-built local Next app connected to the hosted catalog: every new video was reachable through all six paginated level queries, with 43 pages inspected and no duplicate IDs or level mismatches.
- Browser checks at **320, 768 and 1440 pixels**: cards and thumbnails loaded, canonical YouTube links were present, no horizontal overflow and no uncaught page errors. Mobile and desktop screenshots were visually inspected.

Runtime used `VIDMATCH_LEGACY_CATALOG=true` only on the local test server because hosted migrations have not yet been applied. This is not a production configuration recommendation. These checks do not certify actual iOS/Safari playback, every full video, signed-in learning-history writes or deployed Render/Vercel behavior; those remain in the deployment smoke checklist.
