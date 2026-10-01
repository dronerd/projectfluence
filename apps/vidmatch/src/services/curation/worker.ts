import { createHash, randomUUID } from 'node:crypto';
import { evaluateEditorialReview, checkDuration, selectDiverseCandidates, type ApprovedEditorial } from './policy.ts';
import { durationSeconds, playbackRejections, ServiceFailure, type ProviderVideo, type YoutubeProvider } from './provider.ts';
import { type CatalogRow, type CatalogStore, type Candidate, type Run } from './store.ts';
import { discoveryIntents } from './discovery.ts';
import type { VidMatchLevel } from '../videoContract.ts';
export const EVALUATOR_VERSION = 'editorial-evidence-v1';
export type ReviewManifest = {version: 1; reviews: unknown[]};
export type Prepared = {videoId: string; level: VidMatchLevel; channelId: string; topics: string[]; format: string; qualityScore: number; classificationConfidence: number; review: ApprovedEditorial; provider: ProviderVideo};
export function parseManifest(value: unknown): ReviewManifest {
  if (!value || typeof value !== 'object') throw new ServiceFailure('INVALID_MANIFEST', 400);
  const m = value as Partial<ReviewManifest>;
  if (m.version !== 1 || !Array.isArray(m.reviews) || m.reviews.length > 2000) throw new ServiceFailure('INVALID_MANIFEST', 400);
  const ids = m.reviews.map(row => (row as {videoId?: unknown})?.videoId);
  if (ids.some(id => typeof id !== 'string' || !/^[\w-]{11}$/.test(id)) || new Set(ids).size !== ids.length) throw new ServiceFailure('INVALID_OR_DUPLICATE_MANIFEST_ID', 400);
  return m as ReviewManifest;
}
export function reviewMap(manifest: ReviewManifest) { return new Map(manifest.reviews.map(review => [(review as {videoId: string}).videoId, review])); }
export function evaluateCandidate(videoId: string, provider: ProviderVideo | undefined, review: unknown): {candidate?: Prepared; decision: 'approved'|'rejected'|'deferred'; reasons: string[]} {
  if (!provider) return {decision:'rejected', reasons:['unavailable']};
  const playback = playbackRejections(provider);
  if (playback.length) return {decision:'rejected', reasons:playback};
  if (!review) return {decision:'deferred', reasons:['editorial_review_required']};
  const evaluation = evaluateEditorialReview(review);
  if (evaluation.decision !== 'approve' || !evaluation.editorial) return {decision: evaluation.decision === 'reject' ? 'rejected' : 'deferred', reasons:evaluation.reasons.map(reason => reason.code)};
  const editorial = evaluation.editorial;
  if (!checkDuration(editorial.level, durationSeconds(provider.duration) ?? 0)) return {decision:'rejected', reasons:['inappropriate_duration']};
  if (editorial.videoId !== videoId) return {decision:'rejected', reasons:['evidence_video_mismatch']};
  return {decision:'approved', reasons:[], candidate:{videoId, level:editorial.level, channelId:provider.channel_id, topics:editorial.topics, format:editorial.format, qualityScore:editorial.qualityScore, classificationConfidence:editorial.classificationConfidence, review:editorial, provider}};
}
export function legacyRow(candidate: Prepared): Record<string, unknown> {
  const p = candidate.provider, e = candidate.review;
  return {video_id:p.video_id,title:p.title,channel_name:p.channel_name,youtube_url:`https://www.youtube.com/watch?v=${p.video_id}`,thumbnail_url:p.thumbnail_url,duration:p.duration,description:p.description,tags:[],level:e.level,skills:['listening','vocabulary'],topics:e.topics,accent:null,transcript_available:p.captions_available,quality_score:e.qualityScore,source:'youtube',source_video_id:p.video_id,speaker_name:null,source_url:`https://www.youtube.com/watch?v=${p.video_id}`};
}
function diversityExisting(rows: CatalogRow[], metadata: Map<string,ProviderVideo>) {
  return rows.map(row => ({videoId:row.video_id,level:row.level as VidMatchLevel,channelId:row.channel_id || metadata.get(row.video_id)?.channel_id || row.channel_name || 'unknown-existing-channel',topics:row.topics.length?row.topics:['unknown-existing-topic'],format:row.content_format || 'unknown',qualityScore:row.quality_score,classificationConfidence:row.classification_confidence ?? 0}));
}
export function chooseCandidates(candidates: Prepared[], existing: CatalogRow[], metadata: Map<string,ProviderVideo>, targetPerLevel = 30) {
  return selectDiverseCandidates(candidates, {targetPerLevel,maxPerLevelChannel:5,existing:diversityExisting(existing,metadata)});
}
export async function prepareManifest(provider: YoutubeProvider, manifest: ReviewManifest, existing: CatalogRow[], targetPerLevel = 30) {
  const reviews = reviewMap(manifest);
  const metadata = await provider.videos([...reviews.keys(), ...existing.filter(row => !row.channel_id).map(row => row.video_id)]);
  const evaluated = [...reviews].map(([id, review]) => ({videoId:id, ...evaluateCandidate(id, metadata.get(id), review)}));
  const candidates = evaluated.flatMap(item => item.candidate ? [item.candidate] : []);
  const selected = chooseCandidates(candidates, existing, metadata, targetPerLevel);
  return {evaluated,selected,metadata};
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export type WorkerStore = Pick<CatalogStore, 'rpc' | 'catalog' | 'dueDiscoveryIds' | 'healthBatch'>;
export type WorkerProvider = Pick<YoutubeProvider, 'videos' | 'search' | 'usage'>;
const safeError = (error: unknown) => error instanceof ServiceFailure ? error.code : 'WORKER_FAILED';
/** Leased durable runs and immutable evaluations. A missing review never silently publishes. */
export async function runWorker(store: WorkerStore, provider: WorkerProvider, manifest: ReviewManifest, options: {runKey:string; queries?: string[]; discover?: boolean; targetPerLevel?: number; maxBatches?: number; deadlineMs?: number; deadlineAt?:number}) {
  const maxBatches = Math.max(1, Math.min(options.maxBatches ?? 4, 40));
  const deadlineMs = Math.max(60_000, Math.min(options.deadlineMs ?? 180_000, 600_000));
  const config = {queries:options.queries ?? [],discover:options.discover ?? false,targetPerLevel:options.targetPerLevel ?? 30,manifest_sha256:hash(manifest),maxBatches,deadlineMs};
  const run = await store.rpc<Run>('begin_vidmatch_ingestion_run', {p_run_key:options.runKey,p_evaluator_version:EVALUATOR_VERSION,p_config:config,p_lease_seconds:900});
  if (!run.claimed) return {status:run.status, claimed:false};
  const auth = {p_run_id:run.run_id,p_lease_token:run.lease_token};
  const deadline = Math.min(Date.now() + deadlineMs, options.deadlineAt ?? Infinity, run.lease_until ? Date.parse(run.lease_until) - 60_000 : Infinity);
  const assertBudget = () => { if (Date.now() >= deadline - 40_000) throw new ServiceFailure('RUN_BUDGET_REACHED'); };
  const metrics = {discovered:0,analyzed:0,approved:0,rejected:0,deferred:0,inserted:0,existing:0,activation_conflicts:0,api_errors:0};
  try {
    assertBudget();
    const reviews = reviewMap(manifest), existing = await store.catalog(false,deadline);
    // Discovery uses the manifest as an evidence lookup; only an import stages the entire manifest.
    const ids = new Set<string>(!options.discover && !options.queries?.length ? reviews.keys() : []);
    const counts = existing.reduce((acc,row) => {acc[row.level as VidMatchLevel]=(acc[row.level as VidMatchLevel]??0)+1;return acc;},{} as Partial<Record<VidMatchLevel,number>>);
    const queries = options.queries?.length ? options.queries : options.discover ? discoveryIntents(Math.floor(Date.now()/86400000),counts,2).map(intent=>intent.query) : [];
    for (const query of queries.slice(0,2)) {
      let token: string | undefined;
      for (let page=0; page<2; page++) {
        assertBudget();
        const found = await provider.search(query,token,25);
        found.ids.forEach(id=>ids.add(id)); token=found.nextPageToken;
        if (!token) break;
      }
    }
    metrics.discovered=ids.size;
    const discoveryIds = [...ids];
    for (let start=0;start<discoveryIds.length;start+=50) {
      const batchIds=discoveryIds.slice(start,start+50);
      const reviewHashes = new Map(batchIds.map(id => [id, hash(reviews.get(id) ?? null)]));
      assertBudget();
      const dueIds = await store.dueDiscoveryIds(batchIds, EVALUATOR_VERSION, reviewHashes);
      if (!dueIds.length) continue;
      assertBudget();
      const metadata = await provider.videos(dueIds);
      const checkedAt = new Date().toISOString();
      const staged = dueIds.map(id => ({video_id:id,discovery_source:reviews.has(id)?'editorial_manifest':'youtube_search',discovery_context:{review_available:reviews.has(id),review_sha256:hash(reviews.get(id)??null)},provider_metadata:metadata.get(id)??{},metadata_checked_at:checkedAt,input_sha256:hash({provider:metadata.get(id)??null,review:reviews.get(id)??null,version:EVALUATOR_VERSION})}));
      assertBudget();
      await store.rpc('stage_vidmatch_candidates',{...auth,p_candidates:staged});
    }
    // Legacy rows lack channel IDs; names cannot be compared with current provider channel IDs.
    // Resolve them once per run, with the same deadline/batch bounds as candidate verification.
    const legacyMetadata=new Map<string,ProviderVideo>();
    const unresolved=existing.filter(row=>!row.channel_id).map(row=>row.video_id);
    for(let start=0;start<unresolved.length;start+=50) {
      assertBudget();
      const metadata=await provider.videos(unresolved.slice(start,start+50));
      for(const [id,video] of metadata) legacyMetadata.set(id,video);
    }
    let catalog=existing;
    let drained = false;
    for (let batch=0;batch<maxBatches && Date.now()<deadline;batch++) {
      assertBudget();
      const claimed = await store.rpc<{candidates:Candidate[]}>('claim_vidmatch_candidates',{...auth,p_limit:50});
      if (!claimed.candidates.length) { drained = true; break; }
      // Claimed candidates can originate in an earlier run: recheck provider status before approval.
      assertBudget();
      const fresh = await provider.videos(claimed.candidates.map(row=>row.video_id));
      const recheckedAt = new Date().toISOString();
      const rebound = claimed.candidates.map(row => ({video_id:row.video_id,discovery_source:reviews.has(row.video_id)?'editorial_manifest':'youtube_search',
        discovery_context:{review_available:reviews.has(row.video_id),review_sha256:hash(reviews.get(row.video_id)??null)},
        provider_metadata:fresh.get(row.video_id)??{},metadata_checked_at:recheckedAt,
        input_sha256:hash({provider:fresh.get(row.video_id)??null,review:reviews.get(row.video_id)??null,version:EVALUATOR_VERSION})}));
      // Bind the exact newly checked provider data AND current review before using either for publication.
      assertBudget();
      const reboundResult = await store.rpc<{staged:number}>('stage_vidmatch_candidates',{...auth,p_candidates:rebound});
      if (reboundResult.staged !== rebound.length) throw new ServiceFailure('CLAIM_REVALIDATION_CONFLICT');
      const reboundHashes = new Map(rebound.map(row => [row.video_id,row.input_sha256]));
      const evaluated = claimed.candidates.map(row=>({row,...evaluateCandidate(row.video_id,fresh.get(row.video_id),reviews.get(row.video_id))}));
      const approved = evaluated.flatMap(item=>item.candidate?[item.candidate]:[]);
      const selected = new Set(chooseCandidates(approved,catalog,new Map([...legacyMetadata,...fresh]),options.targetPerLevel??30).map(item=>item.videoId));
      // A reviewed existing legacy row can be activated once by SQL, without changing its editorial data.
      approved.filter(item=>catalog.some(row=>row.video_id===item.videoId && row.level===item.level)).forEach(item=>selected.add(item.videoId));
      const results = evaluated.map(item=>{
        const c=item.candidate;
        const decision=c && !selected.has(c.videoId)?'deferred':item.decision;
        const reasons=c && !selected.has(c.videoId)?['diversity_limit']:item.reasons;
        return {video_id:item.row.video_id,evaluation_id:randomUUID(),input_sha256:reboundHashes.get(item.row.video_id),decision,reason_codes:reasons,evidence:c?{...c.review.evidence,reviewer:c.review.reviewer,reviewedAt:c.review.reviewedAt,learningValue:c.review.learningValue,contentValue:c.review.contentValue,confidenceKind:c.review.confidenceKind}:{},editorial:decision==='approved'&&c?{level:c.level,level_min:c.review.levelMin,level_max:c.review.levelMax,skills:['listening','vocabulary'],topics:c.topics,quality_score:c.qualityScore,content_format:c.format,classification_confidence:c.classificationConfidence,editorial_reviewed_at:c.review.reviewedAt}: {},retry_after:new Date(Date.now()+(decision==='rejected'?30:7)*86400000).toISOString()};
      });
      // Catalog health is separate from claimed input; it cannot substitute for the rebind above.
      const refreshed=claimed.candidates.map(row=>({video_id:row.video_id,status:!fresh.has(row.video_id)?'missing':playbackRejections(fresh.get(row.video_id)!).length?'restricted':'available',checked_at:recheckedAt,provider_metadata:fresh.get(row.video_id)}));
      assertBudget();
      await store.rpc('refresh_vidmatch_provider_metadata',{p_checks:refreshed});
      assertBudget();
      const result=await store.rpc<Record<string,number>>('commit_vidmatch_evaluations',{...auth,p_results:results});
      metrics.analyzed+=results.length;
      for (const key of ['approved','rejected','deferred','inserted','existing','activation_conflicts'] as const) metrics[key]+=result[key]??0;
      assertBudget();
      catalog=await store.catalog(false,deadline);
    }
    const status = drained ? 'completed' : 'partial';
    await store.rpc('finish_vidmatch_ingestion_run',{...auth,p_status:status,p_metrics:{...metrics,...provider.usage},p_error_code:drained?null:'BATCH_OR_TIME_BUDGET_REACHED'});
    return {status,claimed:true,...metrics,...provider.usage};
  } catch(error) {
    if (safeError(error) === 'RUN_BUDGET_REACHED') {
      await store.rpc('finish_vidmatch_ingestion_run',{...auth,p_status:'partial',p_metrics:{...metrics,...provider.usage},p_error_code:'RUN_BUDGET_REACHED'});
      return {status:'partial',claimed:true,...metrics,...provider.usage};
    }
    metrics.api_errors++;
    await store.rpc('finish_vidmatch_ingestion_run',{...auth,p_status:'failed',p_metrics:metrics,p_error_code:safeError(error)},{retry:false}).catch(()=>{});
    throw error;
  }
}
export async function checkCatalogHealth(store:WorkerStore,provider:WorkerProvider, options: {maxPurgeBatches?:number;deadlineMs?:number} = {}) {
  const deadline=Date.now()+(options.deadlineMs??60_000);
  const maxPurgeBatches=Math.max(1,Math.min(options.maxPurgeBatches??20,20));
  const batch=await store.healthBatch();
  let result:unknown;
  let providerFailure:unknown;
  try {
    const metadata=await provider.videos(batch.map(row=>row.video_id));
    const checked_at=new Date().toISOString();
    const checks=batch.map(row=>{const video=metadata.get(row.video_id);return {video_id:row.video_id,status:!video?'missing':playbackRejections(video).length?'restricted':'available',checked_at,provider_metadata:video};});
    result=await store.rpc('refresh_vidmatch_provider_metadata',{p_checks:checks});
  } catch(error) {
    providerFailure=error;
    await store.rpc('refresh_vidmatch_provider_metadata',{p_checks:batch.map(row=>({video_id:row.video_id,status:'transient_error',checked_at:new Date().toISOString()}))}).catch(()=>{});
  }
  // Retention work is independent of provider availability and always gets its own bounded budget.
  const purge={purged:0,remaining:false,batches:0};
  try {
    for(let i=0;i<maxPurgeBatches;i++) {
      if(i>0 && Date.now()>=deadline-15_000) break;
      const item=await store.rpc<{purged:number;remaining:boolean}>('purge_expired_vidmatch_provider_data',{p_limit:50});
      purge.purged+=item.purged;purge.remaining=item.remaining;purge.batches++;
      if(!item.remaining) break;
    }
  } catch(error) { if(!providerFailure) throw error; }
  if(providerFailure) throw providerFailure;
  return {checked:batch.length,result,purge,...provider.usage};
}
