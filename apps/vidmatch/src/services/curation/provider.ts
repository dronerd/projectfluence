/** Official metadata only; never retrieve third-party captions or audiovisual bytes. */
export type ProviderVideo = { video_id: string; title: string; channel_name: string; channel_id: string; thumbnail_url: string | null; duration: string | null; description: string | null; tags: string[]; captions_available: boolean; privacy_status: string; upload_status: string; embeddable: boolean; region_restricted: boolean; age_restricted: boolean; live: boolean; audio_language: string | null };
export class ServiceFailure extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 503) { super(code); this.code=code; this.status=status; }
}
export type Fetcher = typeof globalThis.fetch;
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const string = (v: unknown) => typeof v === 'string' ? v : '';
const idPattern = /^[A-Za-z0-9_-]{11}$/;

/** Only reads/idempotent RPCs may retry. Errors never contain a URL, token, or provider body. */
export async function requestJson(url: string, init: RequestInit = {}, options: {fetcher?: Fetcher; attempts?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void>} = {}): Promise<unknown> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  const attempts = Math.max(1, Math.min(options.attempts ?? 3, 3));
  const sleep = options.sleep ?? ((ms) => new Promise(resolve => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetcher(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(options.timeoutMs ?? 12_000) });
      if (response.ok) {
        if (Number(response.headers.get('content-length')) > 5_000_000) throw new ServiceFailure('UPSTREAM_TOO_LARGE');
        return await response.json().catch(() => { throw new ServiceFailure('UPSTREAM_INVALID_JSON'); });
      }
      const status = response.status;
      await response.body?.cancel();
      if ((status === 429 || status >= 500) && attempt + 1 < attempts) {
        const delay = Number(response.headers.get('retry-after')) * 1000;
        await sleep(Math.min(Math.max(delay || 250 * 2 ** attempt, 0), 2500));
        continue;
      }
      throw new ServiceFailure(status === 403 ? 'PROVIDER_FORBIDDEN_OR_QUOTA' : 'UPSTREAM_REQUEST_FAILED', status);
    } catch (error) {
      if (error instanceof ServiceFailure) throw error;
      if (attempt + 1 === attempts) throw new ServiceFailure('UPSTREAM_NETWORK_OR_TIMEOUT');
      await sleep(250 * 2 ** attempt);
    }
  }
  throw new ServiceFailure('UPSTREAM_REQUEST_FAILED');
}
export function durationSeconds(value: string | null): number | null {
  const m = value?.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  if (!m) return null;
  const s = Number(m[1] || 0) * 86400 + Number(m[2] || 0) * 3600 + Number(m[3] || 0) * 60 + Number(m[4] || 0);
  return Number.isFinite(s) && s > 0 ? s : null;
}
export function normalizeProviderVideo(input: unknown): ProviderVideo | null {
  const row = object(input), snippet = object(row.snippet), details = object(row.contentDetails), status = object(row.status);
  if (!idPattern.test(string(row.id))) return null;
  const thumbs = object(snippet.thumbnails), restriction = object(details.regionRestriction);
  const thumbnail = ['high', 'medium', 'standard', 'default'].map(key => string(object(thumbs[key]).url)).find(url => /^https:\/\/i\d*\.ytimg\.com\//.test(url));
  return {video_id: string(row.id), title: string(snippet.title).trim(), channel_name: string(snippet.channelTitle).trim(), channel_id: string(snippet.channelId), thumbnail_url: thumbnail ?? null, duration: string(details.duration) || null, description: string(snippet.description).slice(0, 5000) || null, tags: [], captions_available: details.caption === 'true', privacy_status: string(status.privacyStatus), upload_status: string(status.uploadStatus), embeddable: status.embeddable === true, region_restricted: Array.isArray(restriction.allowed) || (Array.isArray(restriction.blocked) && restriction.blocked.length > 0), age_restricted: object(details.contentRating).ytRating === 'ytAgeRestricted', live: ['live', 'upcoming'].includes(string(snippet.liveBroadcastContent)), audio_language: string(snippet.defaultAudioLanguage) || null};
}
export function playbackRejections(v: ProviderVideo): string[] {
  const reasons: string[] = [];
  if (v.privacy_status !== 'public') reasons.push('not_public');
  if (v.upload_status !== 'processed') reasons.push('not_processed');
  if (!v.embeddable) reasons.push('not_embeddable');
  if (v.region_restricted) reasons.push('region_restricted');
  if (v.age_restricted) reasons.push('age_restricted');
  if (v.live) reasons.push('live_or_upcoming');
  if (!v.title || !v.channel_id || !v.channel_name) reasons.push('invalid_metadata');
  if (!v.thumbnail_url) reasons.push('missing_thumbnail');
  if (!durationSeconds(v.duration)) reasons.push('invalid_duration');
  if (v.audio_language && !/^en(?:-|$)/i.test(v.audio_language)) reasons.push('non_english_audio');
  return reasons;
}
export class YoutubeProvider {
  private searchCalls = 0;
  private metadataCalls = 0;
  private readonly key: string;
  private readonly options: {fetcher?: Fetcher; maxSearchCalls?: number};
  constructor(key: string, options: {fetcher?: Fetcher; maxSearchCalls?: number} = {}) { if (!key) throw new ServiceFailure('YOUTUBE_NOT_CONFIGURED'); this.key=key; this.options=options; }
  get usage() { return { searchCalls: this.searchCalls, metadataCalls: this.metadataCalls }; }
  private async get(resource: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    const query = new URLSearchParams({ ...params, key: this.key });
    return object(await requestJson(`https://www.googleapis.com/youtube/v3/${resource}?${query}`, {}, {fetcher: this.options.fetcher}));
  }
  async search(query: string, pageToken?: string, maxResults = 25): Promise<{ids: string[]; nextPageToken?: string}> {
    if (!query.trim() || query.length > 300) throw new ServiceFailure('INVALID_SEARCH', 400);
    if (this.searchCalls >= (this.options.maxSearchCalls ?? 4)) throw new ServiceFailure('SEARCH_BUDGET_EXHAUSTED', 429);
    this.searchCalls++;
    const data = await this.get('search', {part: 'id', q: query, type: 'video', maxResults: String(Math.min(50, Math.max(1, maxResults))), relevanceLanguage: 'en', videoEmbeddable: 'true', safeSearch: 'strict', ...(pageToken ? {pageToken} : {})});
    if (!Array.isArray(data.items)) throw new ServiceFailure('INVALID_SEARCH_RESPONSE');
    return {ids: [...new Set(data.items.map(row => string(object(object(row).id).videoId)).filter(id => idPattern.test(id)))], nextPageToken: string(data.nextPageToken) || undefined};
  }
  async videos(ids: readonly string[]): Promise<Map<string, ProviderVideo>> {
    const unique = [...new Set(ids)];
    if (unique.some(id => !idPattern.test(id))) throw new ServiceFailure('INVALID_VIDEO_ID', 400);
    const result = new Map<string, ProviderVideo>();
    for (let offset = 0; offset < unique.length; offset += 50) {
      this.metadataCalls++;
      const data = await this.get('videos', {part: 'snippet,contentDetails,status', id: unique.slice(offset, offset + 50).join(',')});
      if (!Array.isArray(data.items)) throw new ServiceFailure('INVALID_METADATA_RESPONSE');
      for (const item of data.items) { const v = normalizeProviderVideo(item); if (v) result.set(v.video_id, v); }
    }
    return result;
  }
}
