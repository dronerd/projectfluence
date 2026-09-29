import "server-only";
import { ApiError, fetchWithTimeout } from "@/app/api/_lib/http";
import { getRequiredEnv, supabaseServiceHeaders } from "@/app/api/_lib/supabaseAuth";
import { LEVELS, overlapFilter, parseVideoRows, type VidMatchLevel, type VidMatchSkill, type VidMatchVideo, type VideoRecommendations } from "./videoContract";
import { normalizeTopics, queryTopicValues } from "./videoTaxonomy";
import { diversifyVideos } from "./recommendationRanking";
import { CANDIDATE_WINDOW, decodeCursor, encodeCursor, filterFingerprint } from "./recommendationCursor";

export type RecommendVideosInput = {
  level?: VidMatchLevel; skills?: VidMatchSkill[]; topics?: string[]; accent?: string;
  transcriptAvailable?: boolean; limit?: number; similarToVideoId?: string; cursor?: string;
};
const BASE_COLUMNS = "video_id,title,channel_name,youtube_url,thumbnail_url,duration,level,skills,topics,accent,transcript_available,source,source_video_id,speaker_name,source_url,created_at";
const CATALOG_COLUMNS = "channel_id,content_format,classification_confidence,level_min,level_max,editorial_reviewed_at,availability_status,availability_checked_at,provider_metadata_expires_at";
const EMPTY: VideoRecommendations = { videos: [], nextCursor: null, hasMore: false };

export async function getRecommendedVideos(input: RecommendVideosInput): Promise<VideoRecommendations> {
  // Explicit migration bridge only. Missing production migrations must fail visibly.
  const legacy = process.env.VIDMATCH_LEGACY_CATALOG === "true";
  const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const headers = supabaseServiceHeaders(getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const select = legacy ? BASE_COLUMNS : `${BASE_COLUMNS},${CATALOG_COLUMNS}`;
  const read = async (params: URLSearchParams, descriptions = false): Promise<VidMatchVideo[]> => {
    params.set("select", descriptions ? `${select},description` : select);
    if (!legacy) {
      params.set("availability_status", "eq.active");
      params.set("editorial_reviewed_at", "not.is.null");
      params.set("provider_metadata_expires_at", `gt.${new Date().toISOString()}`);
    }
    const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1/vidmatch_videos?${params}`, { headers });
    if (!response.ok) throw new ApiError(503, "The video catalog is temporarily unavailable.", "catalog_unavailable");
    return parseVideoRows(await response.json());
  };
  const filters = new URLSearchParams();
  const topics = normalizeTopics(input.topics ?? []).sort();
  const skills = [...new Set(input.skills ?? [])].sort();
  if (input.level) filters.set("level", `eq.${input.level}`);
  if (skills.length) filters.set("skills", overlapFilter(skills));
  if (topics.length) filters.set("topics", overlapFilter(queryTopicValues(topics)));
  if (input.accent) filters.set("accent", `eq.${input.accent}`);
  if (typeof input.transcriptAvailable === "boolean") filters.set("transcript_available", `eq.${input.transcriptAvailable}`);

  let source: VidMatchVideo | undefined;
  if (input.similarToVideoId) {
    [source] = await read(new URLSearchParams({ video_id: `eq.${input.similarToVideoId}`, limit: "1" }));
    if (!source) return EMPTY;
    const sourceIndex = LEVELS.indexOf(source.level);
    if (sourceIndex < 0) return EMPTY;
    filters.set("level", `in.(${LEVELS.slice(Math.max(0, sourceIndex - 1), sourceIndex + 2).join(",")})`);
    filters.set("and", `(video_id.neq.${source.video_id})`);
    // At least a learning topic or skill must match, before the bounded scan.
    const related: string[] = [];
    if (source.topics.length) related.push(`topics.${overlapFilter(queryTopicValues(source.topics))}`);
    else if (source.skills.length) related.push(`skills.${overlapFilter(source.skills)}`);
    if (!related.length) return EMPTY;
    filters.set("or", `(${related.join(",")})`);
  }

  const fingerprint = filterFingerprint({ filters: filters.toString(), source: source?.video_id, legacy });
  let cursor;
  try { cursor = decodeCursor(input.cursor, fingerprint); }
  catch { throw new ApiError(400, "Search conditions changed. Start a new video search.", "invalid_cursor"); }
  const limit = Math.min(Math.max(input.limit ?? 6, 1), 12);
  let candidates: VidMatchVideo[] = [];
  if (cursor.pending.length) {
    const params = new URLSearchParams(filters);
    params.set("video_id", `in.(${cursor.pending.join(",")})`);
    params.set("limit", String(CANDIDATE_WINDOW));
    const rows = new Map((await read(params)).map((video) => [video.video_id, video]));
    candidates = cursor.pending.flatMap((id) => rows.has(id) ? [rows.get(id)!] : []);
  }
  if (candidates.length < limit && cursor.more) {
    const params = new URLSearchParams(filters);
    if (cursor.after) {
      // Keep the source exclusion and keyset condition when similar videos are requested.
      params.delete("video_id");
      params.set("and", `(video_id.gt.${cursor.after}${source ? `,video_id.neq.${source.video_id}` : ""})`);
    }
    params.set("order", "video_id.asc");
    params.set("limit", String(CANDIDATE_WINDOW + 1));
    const rows = await read(params);
    const window = rows.slice(0, CANDIDATE_WINDOW);
    cursor.more = rows.length > CANDIDATE_WINDOW;
    cursor.after = window.at(-1)?.video_id ?? cursor.after;
    candidates.push(...diversifyVideos(window, source));
  }
  const selected = candidates.slice(0, limit);
  cursor.pending = candidates.slice(limit).map((video) => video.video_id);
  // Descriptions are fetched only for the visible page, never the entire ranking window.
  const descriptions = selected.length ? await read(new URLSearchParams({ ...Object.fromEntries(filters), video_id: `in.(${selected.map((video) => video.video_id).join(",")})`, limit: String(limit) }), true) : [];
  const byId = new Map(descriptions.map((video) => [video.video_id, video]));
  const videos = selected.flatMap((video) => byId.has(video.video_id) ? [byId.get(video.video_id)!] : []);
  const hasMore = cursor.pending.length > 0 || cursor.more;
  return { videos, nextCursor: hasMore ? encodeCursor(cursor) : null, hasMore };
}
