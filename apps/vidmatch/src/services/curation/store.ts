import { requestJson, ServiceFailure } from './provider.ts';
export type CatalogRow = {video_id: string; level: string; channel_name: string; channel_id?: string | null; topics: string[]; content_format?: string | null; quality_score: number; classification_confidence?: number | null};
export type Run = {run_id: string; lease_token: string | null; lease_until?: string; claimed: boolean; status: string};
export type Candidate = {video_id: string; input_sha256: string; provider_metadata: Record<string, unknown>; metadata_checked_at: string};
export class CatalogStore {
  private readonly headers: Record<string, string>;
  private readonly url: string;
  constructor(url: string, key: string) {
    if (!url || !key) throw new ServiceFailure('SUPABASE_NOT_CONFIGURED');
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost','127.0.0.1'].includes(parsed.hostname))) throw new ServiceFailure('INVALID_SUPABASE_URL');
    this.url = url.replace(/\/$/, '');
    this.headers = {apikey: key, ...(key.startsWith('sb_secret_') ? {} : {Authorization: `Bearer ${key}`}), 'Content-Type': 'application/json'};
  }
  async rpc<T>(name: string, args: Record<string, unknown>, options:{retry?:boolean} = {}): Promise<T> {
    return await requestJson(`${this.url}/rest/v1/rpc/${name}`, {method: 'POST', headers: this.headers, body: JSON.stringify(args)}, {attempts: options.retry===false || ['begin_vidmatch_ingestion_run', 'claim_vidmatch_candidates', 'purge_expired_vidmatch_provider_data'].includes(name) ? 1 : 3}) as T;
  }
  async catalog(legacy = false, deadlineAt = Infinity): Promise<CatalogRow[]> {
    const rows: CatalogRow[] = [];
    for (let offset = 0; offset < 100_000; offset += 500) {
      if(Date.now()>=deadlineAt-40_000) throw new ServiceFailure('RUN_BUDGET_REACHED');
      const select = 'video_id,level,channel_name,topics,quality_score' + (legacy ? '' : ',channel_id,content_format,classification_confidence');
      const params = new URLSearchParams({select, order: 'video_id.asc', limit: '500', offset: String(offset)});
      const data = await requestJson(`${this.url}/rest/v1/vidmatch_videos?${params}`, {headers: this.headers});
      if (!Array.isArray(data)) throw new ServiceFailure('INVALID_CATALOG_RESPONSE');
      rows.push(...data as CatalogRow[]);
      if (data.length < 500) return rows;
    }
    throw new ServiceFailure('CATALOG_REQUIRES_AGGREGATE_QUERY');
  }
  /** Skip unchanged reviews under a durable cooldown before spending provider quota. */
  async dueDiscoveryIds(ids: string[], evaluatorVersion: string, reviewHashes: ReadonlyMap<string, string>): Promise<string[]> {
    const due: string[] = [];
    for (let start = 0; start < ids.length; start += 50) {
      const batch = ids.slice(start, start + 50);
      if (batch.some(id => !/^[A-Za-z0-9_-]{11}$/.test(id))) throw new ServiceFailure('INVALID_VIDEO_ID', 400);
      const params = new URLSearchParams({select: 'video_id,stage,last_evaluator_version,next_attempt_at,metadata_expires_at,discovery_context', video_id: `in.(${batch.join(',')})`, limit: '50'});
      const data = await requestJson(`${this.url}/rest/v1/vidmatch_candidates?${params}`, {headers:this.headers});
      if (!Array.isArray(data)) throw new ServiceFailure('INVALID_CANDIDATE_RESPONSE');
      type State = {video_id:string;stage:string;last_evaluator_version:string|null;next_attempt_at:string|null;metadata_expires_at:string|null;discovery_context:{review_sha256?:string}};
      const known = new Map<string,State>();
      for (const value of data as unknown[]) {
        if (!value || typeof value !== 'object') throw new ServiceFailure('INVALID_CANDIDATE_RESPONSE');
        const row = value as Partial<State>;
        if (typeof row.video_id !== 'string' || typeof row.stage !== 'string' || !batch.includes(row.video_id)
          || (row.last_evaluator_version !== null && typeof row.last_evaluator_version !== 'string')
          || (row.next_attempt_at !== null && typeof row.next_attempt_at !== 'string')
          || (row.metadata_expires_at !== null && typeof row.metadata_expires_at !== 'string')) throw new ServiceFailure('INVALID_CANDIDATE_RESPONSE');
        known.set(row.video_id,row as State);
      }
      for (const id of batch) {
        const row = known.get(id);
        if (!row || row.last_evaluator_version !== evaluatorVersion || row.discovery_context?.review_sha256 !== reviewHashes.get(id)
          || ['pending','evaluating','stale'].includes(row.stage)
          || (row.next_attempt_at && Date.parse(row.next_attempt_at) <= Date.now())
          || (row.stage === 'approved' && (!row.metadata_expires_at || Date.parse(row.metadata_expires_at) <= Date.now()))) due.push(id);
      }
    }
    return due;
  }
  async healthBatch(limit = 50): Promise<{video_id: string}[]> {
    const params = new URLSearchParams({select: 'video_id', order: 'availability_checked_at.asc.nullsfirst,video_id.asc', limit: String(Math.min(50, limit)), or: `(availability_checked_at.is.null,availability_checked_at.lt.${new Date(Date.now()-86400000).toISOString()})`});
    const data = await requestJson(`${this.url}/rest/v1/vidmatch_videos?${params}`, {headers: this.headers});
    if (!Array.isArray(data)) throw new ServiceFailure('INVALID_CATALOG_RESPONSE');
    return data as {video_id: string}[];
  }
  /** Explicit pre-migration bridge; INSERT ONLY and independently verified before invocation. */
  async insertLegacy(rows: Record<string, unknown>[]): Promise<{video_id: string}[]> {
    const saved: {video_id: string}[] = [];
    for (let start = 0; start < rows.length; start += 50) {
      const data = await requestJson(`${this.url}/rest/v1/vidmatch_videos?on_conflict=video_id&select=video_id`, {method: 'POST', headers: {...this.headers, Prefer: 'resolution=ignore-duplicates,return=representation'}, body: JSON.stringify(rows.slice(start, start + 50))});
      if (!Array.isArray(data)) throw new ServiceFailure('INVALID_INSERT_RESPONSE');
      saved.push(...data as {video_id: string}[]);
    }
    return saved;
  }
}
