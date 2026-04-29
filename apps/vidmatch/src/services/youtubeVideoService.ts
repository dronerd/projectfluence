import "server-only";

export type VidMatchLevel = "A1" | "A2" | "B1" | "B2" | "C1";

export type VidMatchSkill =
  | "listening"
  | "vocabulary"
  | "pronunciation"
  | "grammar"
  | "conversation";

export type VidMatchTopic =
  | "travel"
  | "school"
  | "business"
  | "daily life"
  | "news";

export type VidMatchVideo = {
  video_id: string;
  title: string;
  channel_name: string;
  youtube_url: string;
  thumbnail_url: string | null;
  duration: string | null;
  level: VidMatchLevel;
  skills: VidMatchSkill[];
  topics: VidMatchTopic[];
  accent: string | null;
  transcript_available: boolean;
  description: string | null;
  tags: string[];
  quality_score: number;
};

export type SearchYoutubeVideosInput = {
  query: string;
  level?: VidMatchLevel;
  skills?: VidMatchSkill[];
  topics?: VidMatchTopic[];
  accent?: string;
  maxResults?: number;
  minQualityScore?: number;
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
  };
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
const DEFAULT_TOPICS: VidMatchTopic[] = ["daily life"];

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
    part: "snippet,contentDetails,statistics",
    id: videoIds.join(","),
  });

  const detailsData = await fetchJson<YoutubeVideosResponse>(`${YOUTUBE_VIDEOS_URL}?${detailsParams}`);

  return (
    detailsData.items?.map((item) =>
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
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
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

function normalizeYoutubeVideo(
  item: YoutubeVideoItem,
  metadata: Pick<VidMatchVideo, "level" | "skills" | "topics" | "accent">,
): VidMatchVideo {
  const snippet = item.snippet;
  const thumbnailUrl =
    snippet?.thumbnails?.maxres?.url ??
    snippet?.thumbnails?.high?.url ??
    snippet?.thumbnails?.medium?.url ??
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
  if (lowerQuery.includes("intermediate") || lowerQuery.includes("b1")) return "B1";
  if (lowerQuery.includes("upper intermediate") || lowerQuery.includes("b2")) return "B2";
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

  if (lowerQuery.includes("travel")) topics.add("travel");
  if (lowerQuery.includes("school") || lowerQuery.includes("student")) topics.add("school");
  if (lowerQuery.includes("business") || lowerQuery.includes("work")) topics.add("business");
  if (lowerQuery.includes("news")) topics.add("news");
  if (lowerQuery.includes("daily") || lowerQuery.includes("life") || lowerQuery.includes("routine")) {
    topics.add("daily life");
  }

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

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { next: { revalidate: 3600 } });

  if (!response.ok) {
    throw new Error(`YouTube API request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
