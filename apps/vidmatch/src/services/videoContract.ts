/** Public metadata only. Video bytes and playback remain on YouTube. */
export type VidMatchLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type VidMatchSkill = "listening" | "vocabulary" | "pronunciation" | "grammar" | "conversation";
export type VidMatchTopic = string;
export type VidMatchVideo = {
  video_id: string;
  title: string;
  channel_name: string;
  channel_id?: string | null;
  youtube_url: string;
  thumbnail_url: string | null;
  duration: string | null;
  level: VidMatchLevel;
  skills: VidMatchSkill[];
  topics: string[];
  accent: string | null;
  transcript_available: boolean;
  description: string | null;
  tags: string[];
  quality_score: number;
  source: string;
  source_video_id: string;
  speaker_name: string | null;
  source_url: string;
  created_at?: string;
  content_format?: string | null;
  classification_confidence?: number | null;
  level_min?: VidMatchLevel | null;
  level_max?: VidMatchLevel | null;
  editorial_reviewed_at?: string | null;
  availability_status?: "unknown" | "active" | "suspect" | "inactive";
  availability_checked_at?: string | null;
  provider_metadata_expires_at?: string | null;
};

export type VideoRecommendations = { videos: VidMatchVideo[]; nextCursor: string | null; hasMore: boolean };

export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const SKILLS = ["listening", "vocabulary", "pronunciation", "grammar", "conversation"] as const;
export const ACCENTS = ["American", "British", "Australian", "Canadian"] as const;

export function isYoutubeVideoId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{11}$/.test(value);
}

export function youtubeWatchUrl(videoId: string): string | null {
  return isYoutubeVideoId(videoId) ? `https://www.youtube.com/watch?v=${videoId}` : null;
}

/** Ignore stored outbound URLs, including stale or user-supplied history URLs. */
export function thumbnailSources(videoId: string, thumbnailUrl: string | null): string[] {
  if (!isYoutubeVideoId(videoId)) return [];
  const sources: string[] = [];
  if (thumbnailUrl) {
    try {
      const url = new URL(thumbnailUrl);
      if (url.protocol === "https:" && /^(i\d*\.ytimg\.com|img\.youtube\.com)$/.test(url.hostname) && !url.username && !url.password) {
        sources.push(url.href);
      }
    } catch { /* Invalid metadata must not break a card. */ }
  }
  sources.push(`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`);
  return [...new Set(sources)];
}

/** PostgreSQL array literal, not SQL or PostgREST expression interpolation. */
export function overlapFilter(values: readonly string[]): string {
  const quoted = values.map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return `ov.{${quoted.join(",")}}`;
}

/** A malformed response is an error, never a misleading successful empty list. */
export function parseVideoRows(value: unknown): VidMatchVideo[] {
  if (!Array.isArray(value)) throw new Error("Invalid video response");
  return value.map((row) => {
    if (!row || typeof row !== "object" || !isYoutubeVideoId(row.video_id) || typeof row.title !== "string" || typeof row.channel_name !== "string") {
      throw new Error("Invalid video metadata");
    }
    const strings = (input: unknown): string[] => Array.isArray(input) ? input.filter((item): item is string => typeof item === "string") : [];
    return {
      ...row,
      youtube_url: youtubeWatchUrl(row.video_id),
      thumbnail_url: typeof row.thumbnail_url === "string" ? row.thumbnail_url : null,
      description: typeof row.description === "string" ? row.description : null,
      skills: strings(row.skills), topics: strings(row.topics), tags: strings(row.tags),
      transcript_available: row.transcript_available === true,
      quality_score: Number.isFinite(Number(row.quality_score)) ? Number(row.quality_score) : 0,
    } as VidMatchVideo;
  });
}

export function parseVideoRecommendations(value: unknown): VideoRecommendations {
  if (!value || typeof value !== "object") throw new Error("Invalid recommendation response");
  const raw = value as Record<string, unknown>;
  const videos = parseVideoRows(raw.videos);
  // Keep compatibility with the previous API during a rolling deployment.
  if (raw.hasMore === undefined && raw.nextCursor === undefined) return { videos, nextCursor: null, hasMore: false };
  if (typeof raw.hasMore !== "boolean" || (raw.nextCursor !== null && (typeof raw.nextCursor !== "string" || raw.nextCursor.length > 3000)) || raw.hasMore !== Boolean(raw.nextCursor)) throw new Error("Invalid recommendation pagination");
  return { videos, hasMore: raw.hasMore, nextCursor: raw.nextCursor as string | null };
}
