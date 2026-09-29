# VidMatch: curated listening catalog

VidMatch uses official YouTube links; it does not host, transcode, download, or redistribute video. The Next.js app/API reads public catalog metadata from Supabase. Signed-in preferences and click history are separate, owner-protected records. Playback opens the official YouTube watch page through a native link, including on mobile.

## Content flow

```text
Topic/format search intent or publisher reference
  → official YouTube search (bounded, paginated)
  → stable video ID and durable candidate history
  → current public/processed/embeddable/region/age/live metadata gates
  → independent publisher or reviewer evidence
  → CEFR suitability range and editorial learning/content judgment
  → duration eligibility + channel/topic/format coverage
  → leased transactional evaluation and insert-only publication
  → active, unexpired catalog → filtered, paginated recommendations → YouTube
```

Discovery is not approval. A search query, video title, channel name, academic topic, popularity count, or caption flag cannot assign CEFR. Candidates without sufficient evidence remain deferred. This deliberately replaces the old daily one-result search-and-upsert heuristic, which could overwrite levels and repeatedly add weak content.

The supported levels remain **A1, A2, B1, B2, C1, C2**. A primary level is a suggested starting point; `level_min`/`level_max` retain publisher suitability ranges. Publisher lesson levels describe a learning task, potentially with support; they are not independent measurements of intrinsic listening difficulty. The UI identifies ProjectFluence learning annotations and displays ranges. In particular, C2 is not inferred from a technical subject. The CEFR audiovisual scale refers C2 to C1.

## Editorial review

`catalog/reviews.json` contains stable video IDs and independently authored evidence/annotations, not copied YouTube titles, descriptions, transcripts, thumbnails, statistics, or video files. Every approved entry must identify an exact video and a review date, supported level range, spoken-English evidence, substantive learning/content value, topic and format. Review statements must distinguish publisher evidence from actual listening. Never claim observed audio quality without listening; `audioReview` requires actual observed seconds. A lesson using only an excerpt does not approve its entire source video. Short silent animations, adverts, trailers, unofficial film uploads, content farms and very brief clips are unsuitable for this initial listening catalog.

Use the catalog’s consistent format vocabulary: `explainer`, `interview`, `conversation`, `vlog`, `documentary`, `talk`, `storytelling`, `demonstration`, `news report`, `comedy`, `tour`. Do not create a new synonym just to evade a diversity penalty.

Quality scores use **only independent editorial inputs** (`strong=90`, `adequate=70`; weak rejects). Confidence `.9/.7/.4` represents high/medium/low editorial confidence, not a statistical probability. Low-confidence beginner content is deferred. Missing values are not invented. Technical eligibility is a separate gate, not a popularity score. Approved candidates are selected for underrepresented topics/formats, with no more than five videos from a channel per level in a 30-video target; existing entries count. The cap is a practical ceiling of roughly one sixth of that initial target, not a claim about an ideal global ratio.

Default full-video duration ranges are 1–15 minutes for A1/A2, 2–25 for B1/B2, and 2–45 for C1/C2. These fit a casual listening session and can be changed explicitly in `curation/policy.ts` after reviewing actual learning use. Duration never determines CEFR or quality.

Public captions cannot be downloaded for arbitrary third-party YouTube videos using the Data API: `captions.download` requires OAuth and video-edit permission. This worker performs no caption scraping or third-party proxy calls. The existing `transcript_available` field means **YouTube reports captions in some language**, not that English transcript text has been obtained or checked. Authorized transcripts can supply supplementary word/sentence observations; those heuristics alone never assign CEFR, speech rate, pronunciation clarity, or audio quality. There is no paid LLM dependency in this worker.

References: [CEFR Companion Volume](https://rm.coe.int/cefr-companion-volume-with-new-descriptors-2020/16809ea0d4), [YouTube caption permissions](https://developers.google.com/youtube/v3/docs/captions/download), [video metadata](https://developers.google.com/youtube/v3/docs/videos), [YouTube developer policies](https://developers.google.com/youtube/terms/developer-policies).

## Before running anything

Use Node **22.18+** (within the repository's engine range), `npm ci`, and the root Supabase migration chain in `supabase/migrations`. Do not apply the old app-local `schema.sql` as the production schema. See [Supabase deployment](../../../supabase/README.md) and the [deployment guide](../../../docs/production-deployment.md).

| Variable | Obtain from | Location | Secret | Purpose |
| --- | --- | --- | --- | --- |
| `YOUTUBE_API_KEY` | Google Cloud, YouTube Data API v3 enabled | Next server or local worker only | Yes | Official metadata/search; restrict API scope and monitor project quotas |
| `SUPABASE_URL` | Supabase project API settings | Next server/local worker | No | Existing project REST API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase API Keys (secret or legacy service role) | Next server/local worker only | Yes | Privileged catalog operations, never browser code |
| `VIDMATCH_INGEST_TOKEN` | Generate a separate random secret | Next server | Yes | Administrative discovery route |
| `CRON_SECRET` | Generate a separate random secret | Next server and chosen scheduler | Yes | Daily maintenance/discovery route |
| `PROJECTFLUENCE_URL` | Actual frontend HTTPS origin | Render cron only | No | HTTP endpoint target |
| `VIDMATCH_LEGACY_CATALOG` | Optional literal `true` | Local/temporary Next server only | No | Explicit pre-migration read bridge; bypasses new freshness/review filtering, remove before final production validation |

No additional browser environment variables, Supabase Storage buckets, service-role browser keys, Edge Functions, AI model keys, or persistent disks are needed. Existing public Supabase browser configuration remains necessary for Auth/preferences/history.

## Inspect and import

From the Git repository root, use an **ignored** environment file. The CLI defaults to a read-only inspection and never applies SQL.

```sh
npm run vidmatch:catalog -- inspect --env-file .env.local --report /tmp/vidmatch-review.json
npm run vidmatch:catalog -- import --env-file .env.local --write
```

The first command revalidates metadata and selected thumbnails and reports candidate rejection/diversity reasons. The second uses the migration's leased, atomic publication RPCs. Repeating the same reviewed-manifest import is idempotent. Changed editorial evidence creates a new import identity. A budget-limited `partial` run is terminal for that key; continue with an explicit new `--run-key import-followup-YYYYMMDD-1`. Reviewed completed candidates retain their history and are not reinserted. Keep API snapshots and diagnostic exports temporary and out of Git.

For an existing **pre-migration** project only, the explicit compatibility path inserts legacy columns without changing or deleting any existing row:

```sh
npm run vidmatch:catalog -- inspect --env-file .env.local --legacy-schema --report /tmp/vidmatch-before-import.json
npm run vidmatch:catalog -- import --env-file .env.local --legacy-schema --write --report /tmp/vidmatch-import-result.json
```

This bridge does not provide the new hosted review/freshness enforcement. After applying the migration, run the normal `import --write` command to attach verified provenance/availability to matching-level legacy seed entries. Other legacy entries remain `unknown` until reviewed. A level conflict is reported and must not be silently overwritten. Live catalog inserts are shared data even when the code is on a branch.

## Daily operation

Use **one** scheduler: Vercel's existing `vercel.json`, or Render's `projectfluence-daily-youtube` cron. Both invoke `/api/vidmatch/cron/daily-youtube` at **20:00 UTC / 05:00 JST** using `CRON_SECRET`. The HTTP wrapper's deadline is five minutes. On Vercel, this assumes Fluid compute is enabled; verify the project setting against [Vercel duration limits](https://vercel.com/docs/functions/configuring-functions/duration). The server reserves a shorter shared job budget for safe completion. Do not enable the new worker until its migration and seed activation are complete.

The worker rotates across 19 topics and different formats, prioritizing underfilled levels, with at most four logical search calls per run and 25 results per page. Actual quota limits belong to the configured Google project; do not assume an old fixed cost table. Metadata is batched at 50 IDs. Transient network/429/5xx errors have bounded backoff; invalid requests, authentication failures and quota-denied 403s are not retried. Errors/logs contain safe codes and counts, not keys, full URLs or transcript text.

Manual discovery stages candidates for review:

```sh
curl --fail-with-body -X POST "$PROJECTFLUENCE_URL/api/vidmatch/ingest-youtube" \
  -H "Authorization: Bearer $VIDMATCH_INGEST_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"query":"local travel story clear English narration","runKey":"manual-travel-20260930"}'
```

The old `level`, `accent`, `minQualityScore` etc. request fields are intentionally rejected: search is no longer a direct publication interface. There is no public frontend caller of this administrative endpoint. Review deferred candidates with a server-side administrative query, evaluate their actual content, then add independent evidence to a reviewed manifest and run import. The worker cannot independently certify brand-new content without that evidence; an editorial review UI and licensed transcript integration remain future work.

```sh
npm run vidmatch:catalog -- discover --env-file .env.local --write
npm run vidmatch:catalog -- health --env-file .env.local --write
```

Availability checks exclude suspect videos after a confirmed missing/restricted result and mark inactive after a second confirmation at least 24 hours later. Transient API failures do not add strikes. Provider metadata expires within 30 days; bounded purge redacts old provider copies without deleting learning history or independent editorial annotations. Run health often enough to cover the entire catalog within that window (50 oldest entries per run). Monitor `remaining` purge/backlog counts and schedule additional health passes as the catalog grows.

## Deployment ordering for this branch

1. Keep the branch separate until the main application's deployment setup is ready. The work does not merge itself or deploy hosted SQL.
2. Back up the existing project; validate the root migrations in staging. Follow the baseline/adoption procedure in `supabase/README.md`; inspect `npx supabase db push --dry-run` before applying to the intended linked project.
3. Apply migrations through `20260930000100_vidmatch_curation.sql` using the Supabase CLI.
4. Using that same project's server credentials, run `npm run vidmatch:catalog -- import --env-file .env.local --write`. Check inserted/existing/activation-conflict counts and active counts per level. Refreshing metadata alone does not approve unreviewed legacy videos.
5. Deploy this branch's Next.js build to the already configured Vercel or Render service. Keep `VIDMATCH_LEGACY_CATALOG` unset. The Python SpeakWise service needs no changes for this branch.
6. Enable exactly one daily scheduler with the same `CRON_SECRET` as Next. The actual Next URL is needed for Render's `PROJECTFLUENCE_URL`; Vercel calls its own route automatically.
7. Exercise all six levels, topics, pagination, similar results, thumbnails and native YouTube links on desktop/mobile; sign in and verify saved preferences/click history. Check safe server logs and browser console. Run health twice only with the documented confirmation interval when testing unavailable states; use staging fixtures rather than intentionally removing production content.

## Validation

```sh
npm test
npm run typecheck
npm run lint
npm run build
PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node scripts/validate-database.mjs
PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node scripts/validate-vidmatch-curation-db.mjs
```

Tests cover provider URL/ID parsing, evidence gates, duration, diversity/deduplication, bounded retry, search rotation, recommendation pagination, owner permissions, leases, transaction rollback, retry identity, availability confirmation and retention. Browser/API fixture commands and actual execution results are recorded in the audit report. Chromium responsive emulation is not physical iPhone/iPad/Safari playback validation. API embeddability cannot guarantee every country's playback, future rights changes, or browser/account restrictions; the native YouTube link remains the reliable fallback.

Dated findings, exact live counts and validation results: [curation audit](../../../docs/vidmatch-curation-audit.md).
