# VidMatch curation audit — 29 September 2026

## Delivered and deployment boundary

Work is isolated in `codex/vidmatch-curated-catalog`, created from `origin/main` at `6d699e3` in a separate worktree. The user's original checkout and its uncommitted transcript/IR work were not used as an implementation base or modified.

The user explicitly authorized additions to the existing Supabase catalog. The new CLI added **134 videos** through the legacy-schema, insert-only path. Read-back verified **190 unique IDs**, all 134 additions present, and **all 56 original rows unchanged**. No hosted migration, function deployment, service configuration, merge, or production code deployment was performed.

The new migration is required before deploying the new worker and active-only recommendation behavior. Legacy records begin `unknown`; a reviewed matching-level manifest import activates eligible seed rows without overwriting their prior editorial labels. Other old entries are not silently certified. Full deployment ordering and exact commands are in [the VidMatch runbook](../apps/vidmatch/README.md#deployment-ordering-for-this-branch) and [Supabase instructions](../supabase/README.md).

## Architecture and original weaknesses

Originally, Next.js handled an administrative search endpoint and a daily cron endpoint. They called YouTube Data API search/details, assigned CEFR from the supplied search intent or query substrings, calculated a quality heuristic using captions/description/tags/duration/views/likes, and merge-upserted Supabase catalog rows. The daily job chose one result from a small rotating query list. Captions were only a provider presence flag; no transcript text or acoustic analysis was performed.

The browser requested recommendations from Next.js, which used a service credential to query Supabase. The six CEFR levels were already A1–C2. Preferences and click history were authenticated separately. Cards linked directly to official YouTube watch pages; this repository does not serve video bytes, use temporary media URLs, Supabase Storage video buckets, codec conversion or video streaming infrastructure.

Highest-impact findings:

- **Level integrity:** search text could become a difficulty label without language evidence. Technical subjects and accidental level-like query matches produced misleading assignments.
- **Catalog stability:** repeated merge-upserts could overwrite prior classifications; there was no durable evaluation/rejection history or review gate.
- **Provider reliability:** embedding, region, live/upcoming status, language declarations and metadata freshness were insufficiently checked. There was no revalidation lifecycle.
- **Learning evidence:** caption presence was treated too strongly; it neither identifies English captions nor establishes a usable transcript or accurate subtitles.
- **Discovery variety:** a one-result daily search and a small fixed topic list could not deliberately improve coverage or compare candidates.
- **Recommendation reachability:** only the first small result set was accessible. Similarity scanned an unrelated global window; mixed-case legacy topics could disappear under normalized filters.
- **Provider constraints:** arbitrary third-party caption downloads are not available through an API key. Provider popularity metrics must not become an invented educational quality score.

## Pipeline changes

The pipeline now separates discovery, technical eligibility, independent editorial review, diversity selection, publication and maintenance.

- Search intents rotate across 19 topics, formats and learner bands, prioritizing underfilled bands. At most four logical search requests per run, paginated at 25 results; details batches contain at most 50 IDs. Search intent never assigns CEFR.
- Strict provider gates check public/processed status, embedding permission, declared non-English audio, region restrictions, age restrictions, live/upcoming state, nonempty metadata, thumbnail URLs and duration. Initial imports also checked each selected thumbnail with a successful image response.
- Exact publisher references and structured editorial judgments replace title/query/popularity classification. CEFR ranges, provenance, reviewer/date, learning/content value, qualitative confidence and explicit uncertainty are retained. Broad publisher ranges cannot establish C2. Excerpt-only evidence cannot approve the whole source video.
- Authorized transcripts can provide supplementary orthographic observations. They do not automatically determine CEFR, speech speed, pronunciation, speaker overlap or audio quality. This task did not acquire transcript text or implement scraping/paid LLM calls.
- Selection considers existing catalog counts, underrepresented topics/formats and channel limits. Stable provider IDs prevent URL-form duplicates; candidate histories and cooldowns prevent repeatedly reevaluating unchanged rejected evidence.
- Database run leases, candidate claims, snapshot/evidence hashes and transactional publication prevent concurrent workers from committing mismatched judgments or duplicate rows. Lost claim responses are not blindly retried. Publication retries have stable identities. Partial runs require a new run key; completed schedules return before spending discovery quota.
- Provider calls retry only transient failures with bounded backoff. Credentials/provider messages are not exposed in errors. Health and discovery share a bounded cron deadline, with time reserved for recording completion.
- Availability distinguishes transient errors from confirmed missing/restricted videos. First confirmation hides a suspect video; a second at least 24 hours later marks inactive. Success restores reviewed entries. Provider snapshots expire within 30 days; bounded purge removes stale provider copies while preserving independent annotations, catalog identities and learning history.
- Recommendations filter eligible rows before bounded keyset pagination, diversify channels, expose “More videos,” preserve prior results on recoverable failures, and validate cursors. Similarity uses level proximity and related learning topics. Canonical topic filters expand known legacy labels and case variants without rewriting old annotations.

The new migration adds three service-only/RLS-protected pipeline tables and supporting RPCs, plus review/range/availability/freshness fields. Its indexes match candidate claiming, metadata expiry, level/ID pagination and oldest-first health queries. The service key remains server-only.

## Catalog results

The source investigation examined 399 public ESL Brains lesson pages, retaining exact article-level CEFR labels and YouTube references. Fluentize supplied additional beginner evidence. References to silent/visual-only clips, primarily promotional material, unsupported speech, short clips, excerpt-only use, non-public videos, geographic restrictions and non-embeddable sources were excluded. No worksheet/paywall bypass, media download, transcript scraper or rehosting was used.

The committed review manifest contains **135 source-qualified records**. **134 were inserted**; one additional B2 candidate was deferred by the existing channel cap. The original 56 records were preserved, not independently recertified by this run.

| Level | Before | Added | Live total | Distinct channels among additions | Largest new channel contribution |
| --- | ---: | ---: | ---: | ---: | ---: |
| A1 | 9 | 17 | 26 | 15 | 3 |
| A2 | 9 | 18 | 27 | 18 | 1 |
| B1 | 10 | 27 | 37 | 23 | 2 |
| B2 | 12 | 24 | 36 | 20 | 2 |
| C1 | 8 | 24 | 32 | 21 | 3 |
| C2 | 8 | 24 | 32 | 21 | 3 |
| **Total** | **56** | **134** | **190** | — | — |

Every level now has 26–37 live records. The newly reviewed A1 and A2 subsets contain 17 and 18 entries, respectively; the overall totals include retained legacy videos. Additional beginner content was not padded with silent clips or adverts merely to reach a target.

Topic counts below overlap because a video can have multiple independent editorial topics. Formats use a consistent vocabulary rather than counting synonymous labels as different kinds of content.

| Level | Main topic coverage among additions | Format mix among additions | Observed source duration range |
| --- | --- | --- | --- |
| A1 | Everyday life 11; work 4; entertainment 4; travel 4; culture 3; design 2 | Stories 4, interviews 4, comedy 2, tours 2, demonstrations 2, documentaries 2, vlog 1 | 1:00–3:51 |
| A2 | Everyday life 7; travel 5; food 3; entertainment 3; culture 3; technology 2 | News/tours/interviews/explainers 3 each, demonstrations 2, plus story/documentary/conversation/comedy | 1:06–4:24 |
| B1 | Everyday life 8; work 7; psychology 7; travel 6; society 6; health 4 | News 9, explainers 8, demonstrations 3, interviews 2, plus documentary/story/tour/conversation/comedy | 2:10–6:08 |
| B2 | Psychology/work/technology 6 each; business/everyday life 5 each; environment 4 | Explainers 7, news 5, talks 5, documentaries 3, interviews 2, demonstration/story 1 each | 2:18–10:33 |
| C1 | Society 12; work 5; science/culture/creativity 4 each; environment 3 | Explainers 11, news 6, talks/stories 2 each, documentary/comedy/interview 1 each | 2:11–6:50 |
| C2 | Business 7; technology/culture/entertainment 6 each; society/science 5 each | Explainers 10, news 7, interviews 5, talks 2 | 2:11–6:46 |

These are dated audit observations, not provider popularity/quality scores. C1 remains heavier on social explanations; longer advanced material and more independently reviewed beginner material are useful future curation priorities.

Representative selections, using independently written labels:

| Level | Example | What the evidence supports |
| --- | --- | --- |
| A1 | [A one-minute personal introduction](https://www.youtube.com/watch?v=-E_HCGKQXBk) | Exact A1 publisher listening task about personal information |
| A2 | [Making French toast](https://www.youtube.com/watch?v=vPrtNzvDS5M) | A2 instructional listening with concrete action sequence |
| B1 | [An airport working dog](https://www.youtube.com/watch?v=-QxZv_wJ1aA) | Publisher-linked listening about a concrete animal/work story |
| B2 | [Coral restoration](https://www.youtube.com/watch?v=L761OoyW7qg) | Connected explanation of a practical conservation project |
| C1 | [An educator's experience](https://www.youtube.com/watch?v=Aj_UWp8Y5D4) | C1–C2 publisher task supporting experiences and qualified arguments |
| C2 | [An unconventional airport boarding design](https://www.youtube.com/watch?v=j3OqAN4ISOw) | A publisher-graded advanced comparison/evaluation task |

Individual evidence URLs and rationales are in `apps/vidmatch/catalog/reviews.json`. Publisher levels describe supported learning tasks, not an independently measured intrinsic CEFR of the entire recording. Representative source instructions and exact references were manually sanity-checked. **No full-catalog human listening assessment, speech-rate measurement, accent scoring or subtitle-accuracy verification is claimed.** Of the additions, 83 report captions, but their language/accuracy is not established by that flag. The app makes this limitation visible.

## Actual validation

- `npm test`: **88 tests passed** (4 frontend learning + 84 backend/contract/curation tests), no failures/skips.
- `npm run typecheck`: passed.
- `npm run lint`: passed without warnings/errors.
- `npm run build`: passed, including sitemap generation; a final production Next build with the completed manifest also passed.
- Existing isolated PostgreSQL suite: **23 checks passed**.
- New curation PostgreSQL suite: **18 checks passed**, including real worker-to-SQL sequencing, hash rebinding, idempotency, transaction rollback, lease recovery, role denial, legacy activation and retention. The embedded engine serializes connections; independent concurrent PostgREST staging remains a deployment check.
- Auth HTTP fixture: unauthenticated administrative routes return 401; malformed/oversized requests return 400/413; a completed run does not call upstream providers again.
- Recommendation HTTP fixture: all eligible rows remain reachable beyond unrelated rows, legacy mixed-case/alias filters work, unreviewed/expired rows are excluded, similar results retain topic/level constraints, malformed cursor returns 400 and DB failure returns 503.
- Browser fixtures: pagination, retries, invalid-cursor recovery and responsive layout passed. Earlier seven-width VidMatch/analytics checks reported no overflow and zero axe violations.
- **Real hosted catalog import/read-back:** 134 inserted; 190 unique IDs; all original 56 records unchanged.
- **Local production build using the real hosted catalog in explicit legacy read mode:** paginated all six levels, found every addition, no duplicate IDs/incorrect levels; browser checks at 320/768/1440px had no overflow, broken thumbnails or page errors. Native watch links use validated canonical IDs.
- Official iframe playback probe: three representative A1/B1/C2 videos reached `PLAYING` and advanced beyond three seconds in Chromium. This is a probe, not a change to the app's native-link playback design.
- Diff/secret review: generated sitemap restored; no environment files, downloaded media, raw provider dumps or temporary screenshots included; configured server secrets absent from changed files and built browser bundles.

Physical iPhone/iPad, Safari, Android and Edge playback has not been tested in this environment. API public/embeddable status and one-region browser playback cannot guarantee future rights, account, geographic or network conditions.

## Remaining work and deployment checks

**Required external deployment:** apply the new migration after the baseline/hardening migrations, import the manifest again through the normal RPC path to activate matching legacy seed entries, deploy the Next branch, and enable only one scheduler. The hosted database is intentionally still on its current schema. Do not merge into an auto-deploying main branch before this ordering is ready.

**Editorial/product decisions:** whether A1/A2 should require verified English captions; whether to offer a clearer distinction between publisher-supported tasks and independently assessed listening difficulty; whether to support explicit video segments. Currently excerpt-only evidence is deferred. Legacy videos require review before activation; the migration does not pretend all old query-based labels are valid.

**Future architectural work:** licensed/owner-authorized transcripts, a reviewer interface for deferred candidates, richer independently assessed language features, and a scalable aggregate query for a much larger catalog. New discovery candidates are deliberately not auto-published without evidence. No LLM or third-party transcript service was added simply to automate uncertain judgments.

**Operational follow-up:** monitor Google project quotas and pipeline metrics; increase health/purge cadence as the catalog grows; periodically sample real devices and spoken-content quality; review independent backup/export retention. Public metadata in temporary local validation artifacts is outside the database purge mechanism and should not become a permanent provider-data archive.
