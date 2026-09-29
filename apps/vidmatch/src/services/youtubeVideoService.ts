import { supabaseServiceHeaders } from "@/app/api/_lib/supabaseAuth";
import "server-only";

import { fetchWithTimeout as fetch } from "@/app/api/_lib/http";
import { getRequiredEnv } from "@/app/api/_lib/supabaseAuth";
import { isYoutubeVideoId, overlapFilter, parseVideoRows, type VidMatchVideo, type VidMatchLevel, type VidMatchSkill, type VidMatchTopic } from "./videoContract";
export type { VidMatchVideo, VidMatchLevel, VidMatchSkill, VidMatchTopic } from "./videoContract";

export type SearchYoutubeVideosInput = {
  query: string;
  level?: VidMatchLevel;
  skills?: VidMatchSkill[];
  topics?: VidMatchTopic[];
  accent?: string;
  maxResults?: number;
  minQualityScore?: number;
};

export type RecommendVideosInput = {
  level?: VidMatchLevel;
  skills?: VidMatchSkill[];
  topics?: VidMatchTopic[];
  accent?: string;
  transcriptAvailable?: boolean;
  limit?: number;
  similarToVideoId?: string;
};

type YoutubeSearchResponse = {
  items?: Array<{
    id?: {
      videoId?: string;
    };
  }>;
};

type YoutubeVideosResponse = {
  items?: YoutubeVideoItem[];
};

type YoutubeVideoItem = {
  id: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    description?: string;
    tags?: string[];
    thumbnails?: {
      maxres?: { url?: string };
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
  contentDetails?: {
    duration?: string;
    caption?: string;
    contentRating?: { ytRating?: string };
  };
  status?: { privacyStatus?: string; uploadStatus?: string; embeddable?: boolean };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
  };
};

type SupabaseError = {
  message?: string;
  details?: string;
  hint?: string;
};

const YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const DEFAULT_SKILLS: VidMatchSkill[] = ["listening", "vocabulary"];
const DEFAULT_TOPICS: VidMatchTopic[] = ["travel", "daily life", "school"];

export async function searchAndSaveYoutubeVideos(input: SearchYoutubeVideosInput) {
  const videos = await searchYoutubeVideos(input);
  const minQualityScore = input.minQualityScore ?? 0;
  const goodVideos = videos.filter((video) => video.quality_score >= minQualityScore);

  if (goodVideos.length === 0) {
    return { searched: videos.length, saved: 0, videos: [] };
  }

  const savedVideos = await saveVideosToSupabase(goodVideos);
  return { searched: videos.length, saved: savedVideos.length, videos: savedVideos };
}

export async function searchYoutubeVideos(input: SearchYoutubeVideosInput): Promise<VidMatchVideo[]> {
  const apiKey = getRequiredEnv("YOUTUBE_API_KEY");
  const maxResults = Math.min(Math.max(input.maxResults ?? 10, 1), 25);

  const searchParams = new URLSearchParams({
    key: apiKey,
    part: "id",
    q: input.query,
    type: "video",
    maxResults: String(maxResults),
    relevanceLanguage: "en",
    videoEmbeddable: "true",
    safeSearch: "moderate",
  });

  const searchData = await fetchJson<YoutubeSearchResponse>(`${YOUTUBE_SEARCH_URL}?${searchParams}`);
  const videoIds = Array.from(
    new Set(searchData.items?.map((item) => item.id?.videoId).filter(Boolean) as string[]),
  );

  if (videoIds.length === 0) {
    return [];
  }

  const detailsParams = new URLSearchParams({
    key: apiKey,
    part: "snippet,contentDetails,statistics,status",
    id: videoIds.join(","),
  });

  const detailsData = await fetchJson<YoutubeVideosResponse>(`${YOUTUBE_VIDEOS_URL}?${detailsParams}`);

  return (
    detailsData.items?.filter((item) => isYoutubeVideoId(item.id) && item.status?.privacyStatus === "public" && item.status?.uploadStatus === "processed" && item.contentDetails?.contentRating?.ytRating !== "ytAgeRestricted").map((item) =>
      normalizeYoutubeVideo(item, {
        level: input.level ?? inferLevel(input.query),
        skills: input.skills?.length ? input.skills : inferSkills(input.query),
        topics: input.topics?.length ? input.topics : inferTopics(input.query),
        accent: input.accent ?? inferAccent(`${input.query} ${item.snippet?.title ?? ""}`),
      }),
    ) ?? []
  );
}

export async function saveVideosToSupabase(videos: VidMatchVideo[]): Promise<VidMatchVideo[]> {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const response = await fetch(`${supabaseUrl}/rest/v1/vidmatch_videos?on_conflict=video_id`, {
    method: "POST",
    headers: {
      ...supabaseServiceHeaders(serviceRoleKey),
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(videos),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as SupabaseError | null;
    throw new Error(error?.message ?? `Supabase insert failed with status ${response.status}`);
  }

  return response.json() as Promise<VidMatchVideo[]>;
}

export async function getRecommendedVideos(input: RecommendVideosInput): Promise<VidMatchVideo[]> {
  if (input.similarToVideoId) {
    return getSimilarVideos(input.similarToVideoId, input.limit);
  }

  const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const limit = Math.min(Math.max(input.limit ?? 6, 1), 12);

  const params = new URLSearchParams({
    select:
      "video_id,title,channel_name,youtube_url,thumbnail_url,duration,level,skills,topics,accent,transcript_available,description,tags,quality_score,source,source_video_id,speaker_name,source_url,created_at",
    order: "quality_score.desc,created_at.desc",
    limit: String(limit),
  });

  if (input.level) {
    params.set("level", `eq.${input.level}`);
  }

  if (typeof input.transcriptAvailable === "boolean") {
    params.set("transcript_available", `eq.${input.transcriptAvailable}`);
  }

  // Filter in PostgreSQL before LIMIT; client filtering lost matches below the first 100 rows.
  if (input.skills?.length) params.set("skills", overlapFilter(input.skills));
  if (input.topics?.length) params.set("topics", overlapFilter(input.topics));
  if (input.accent) params.set("accent", `eq.${input.accent}`);

  const response = await fetch(`${supabaseUrl}/rest/v1/vidmatch_videos?${params}`, {
    headers: {
      ...supabaseServiceHeaders(serviceRoleKey),
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as SupabaseError | null;
    throw new Error(error?.message ?? `Supabase recommendation query failed with status ${response.status}`);
  }

  return parseVideoRows(await response.json());
}

async function getSimilarVideos(videoId: string, limitInput?: number): Promise<VidMatchVideo[]> {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const limit = Math.min(Math.max(limitInput ?? 6, 1), 12);
  const select =
    "video_id,title,channel_name,youtube_url,thumbnail_url,duration,level,skills,topics,accent,transcript_available,description,tags,quality_score,source,source_video_id,speaker_name,source_url,created_at";

  const sourceParams = new URLSearchParams({
    select,
    video_id: `eq.${videoId}`,
    limit: "1",
  });

  const sourceResponse = await fetch(`${supabaseUrl}/rest/v1/vidmatch_videos?${sourceParams}`, {
    headers: {
      ...supabaseServiceHeaders(serviceRoleKey),
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!sourceResponse.ok) {
    const error = (await sourceResponse.json().catch(() => null)) as SupabaseError | null;
    throw new Error(error?.message ?? `Supabase source video query failed with status ${sourceResponse.status}`);
  }

  const sourceVideos = parseVideoRows(await sourceResponse.json());
  const sourceVideo = sourceVideos[0];
  if (!sourceVideo) return [];

  const candidateParams = new URLSearchParams({
    select,
    order: "quality_score.desc,created_at.desc",
    limit: "200",
  });

  const candidateResponse = await fetch(`${supabaseUrl}/rest/v1/vidmatch_videos?${candidateParams}`, {
    headers: {
      ...supabaseServiceHeaders(serviceRoleKey),
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!candidateResponse.ok) {
    const error = (await candidateResponse.json().catch(() => null)) as SupabaseError | null;
    throw new Error(error?.message ?? `Supabase similar video query failed with status ${candidateResponse.status}`);
  }

  const candidates = parseVideoRows(await candidateResponse.json());
  return candidates
    .filter((video) => video.video_id !== sourceVideo.video_id)
    .map((video) => ({ video, similarityScore: scoreSimilarity(sourceVideo, video) }))
    .filter((item) => item.similarityScore > 0)
    .sort((a, b) => b.similarityScore - a.similarityScore || b.video.quality_score - a.video.quality_score)
    .slice(0, limit)
    .map((item) => item.video);
}

function normalizeYoutubeVideo(
  item: YoutubeVideoItem,
  metadata: Pick<VidMatchVideo, "level" | "skills" | "topics" | "accent">,
): VidMatchVideo {
  const snippet = item.snippet;
  const thumbnailUrl =
    snippet?.thumbnails?.high?.url ??
    snippet?.thumbnails?.medium?.url ??
    snippet?.thumbnails?.maxres?.url ??
    snippet?.thumbnails?.default?.url ??
    null;

  return {
    video_id: item.id,
    title: snippet?.title ?? "Untitled video",
    channel_name: snippet?.channelTitle ?? "Unknown channel",
    youtube_url: `https://www.youtube.com/watch?v=${item.id}`,
    thumbnail_url: thumbnailUrl,
    duration: item.contentDetails?.duration ?? null,
    level: metadata.level,
    skills: metadata.skills,
    topics: metadata.topics,
    accent: metadata.accent,
    transcript_available: item.contentDetails?.caption === "true",
    description: snippet?.description ?? null,
    tags: snippet?.tags ?? [],
    quality_score: scoreVideo(item),
    source: "youtube",
    source_video_id: item.id,
    speaker_name: null,
    source_url: `https://www.youtube.com/watch?v=${item.id}`,
  };
}

function scoreVideo(item: YoutubeVideoItem) {
  const views = Number(item.statistics?.viewCount ?? 0);
  const likes = Number(item.statistics?.likeCount ?? 0);
  const hasCaptions = item.contentDetails?.caption === "true";
  const hasDescription = Boolean(item.snippet?.description?.trim());
  const hasTags = Boolean(item.snippet?.tags?.length);
  const durationSeconds = parseYoutubeDuration(item.contentDetails?.duration);

  let score = 40;
  if (hasCaptions) score += 20;
  if (hasDescription) score += 10;
  if (hasTags) score += 8;
  if (durationSeconds >= 120 && durationSeconds <= 900) score += 12;
  if (views >= 10_000) score += 5;
  if (likes >= 500) score += 5;

  return Math.min(score, 100);
}

function parseYoutubeDuration(duration?: string) {
  if (!duration) return 0;

  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function inferLevel(query: string): VidMatchLevel {
  const lowerQuery = query.toLowerCase();
  if (lowerQuery.includes("beginner") || lowerQuery.includes("a1")) return "A1";
  if (lowerQuery.includes("elementary") || lowerQuery.includes("a2")) return "A2";
  if (lowerQuery.includes("upper intermediate") || /\bb2\b/.test(lowerQuery)) return "B2";
  if (lowerQuery.includes("intermediate") || /\bb1\b/.test(lowerQuery)) return "B1";
  if (lowerQuery.includes("proficiency") || lowerQuery.includes("c2")) return "C2";
  if (lowerQuery.includes("advanced") || lowerQuery.includes("c1")) return "C1";
  return "B1";
}

function inferSkills(query: string): VidMatchSkill[] {
  const lowerQuery = query.toLowerCase();
  const skills = new Set<VidMatchSkill>();

  if (lowerQuery.includes("pronunciation")) skills.add("pronunciation");
  if (lowerQuery.includes("grammar")) skills.add("grammar");
  if (lowerQuery.includes("conversation") || lowerQuery.includes("speaking")) skills.add("conversation");
  if (lowerQuery.includes("vocabulary") || lowerQuery.includes("phrases")) skills.add("vocabulary");
  if (lowerQuery.includes("listening")) skills.add("listening");

  return skills.size ? Array.from(skills) : DEFAULT_SKILLS;
}

function inferTopics(query: string): VidMatchTopic[] {
  const lowerQuery = query.toLowerCase();
  const topics = new Set<VidMatchTopic>();

  if (lowerQuery.includes("travel") || lowerQuery.includes("trip") || lowerQuery.includes("vacation")) topics.add("travel");
  if (lowerQuery.includes("daily") || lowerQuery.includes("life") || lowerQuery.includes("routine")) topics.add("daily life");
  if (lowerQuery.includes("school") || lowerQuery.includes("student") || lowerQuery.includes("education")) topics.add("school");

  return topics.size ? Array.from(topics) : DEFAULT_TOPICS;
}

function inferAccent(text: string) {
  const lowerText = text.toLowerCase();
  if (lowerText.includes("british") || lowerText.includes(" uk ")) return "British";
  if (lowerText.includes("australian")) return "Australian";
  if (lowerText.includes("canadian")) return "Canadian";
  if (lowerText.includes("american") || lowerText.includes(" usa ") || lowerText.includes(" us ")) return "American";
  return null;
}

function scoreSimilarity(sourceVideo: VidMatchVideo, candidate: VidMatchVideo) {
  const skillOverlap = countOverlap(sourceVideo.skills, candidate.skills);
  const topicOverlap = countOverlap(sourceVideo.topics, candidate.topics);
  const tagOverlap = countOverlap(sourceVideo.tags, candidate.tags);
  let score = 0;

  if (candidate.level === sourceVideo.level) score += 24;
  if (sourceVideo.accent && candidate.accent?.toLowerCase() === sourceVideo.accent.toLowerCase()) score += 10;
  if (candidate.transcript_available === sourceVideo.transcript_available) score += 4;

  score += skillOverlap * 18;
  score += topicOverlap * 16;
  score += Math.min(tagOverlap, 6) * 4;
  score += Number(candidate.quality_score || 0) / 10;

  return score;
}

function countOverlap(leftValues: string[], rightValues: string[]) {
  const normalizedRight = new Set(rightValues.map((value) => value.toLowerCase()));
  return leftValues.filter((value) => normalizedRight.has(value.toLowerCase())).length;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`YouTube API request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}
