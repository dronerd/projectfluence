import { NextRequest, NextResponse } from "next/server";
import {
  getRecommendedVideos,
  type RecommendVideosInput,
  type VidMatchLevel,
  type VidMatchSkill,
} from "@/apps/vidmatch/src/services/youtubeVideoService";

export const runtime = "nodejs";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const SKILLS = ["listening", "vocabulary", "pronunciation", "grammar", "conversation"] as const;
const MAX_TOPIC_COUNT = 10;
const MAX_TOPIC_LENGTH = 80;

export async function GET(request: NextRequest) {
  const input = parseRecommendationInput(request.nextUrl.searchParams);
  if (input instanceof NextResponse) return input;

  try {
    const videos = await getRecommendedVideos(input);
    return NextResponse.json({ videos });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recommendation request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseRecommendationInput(searchParams: URLSearchParams): RecommendVideosInput | NextResponse {
  const level = searchParams.get("level");
  const skills = searchParams.getAll("skills");
  const topics = parseTopics(searchParams.getAll("topics"));
  const accent = searchParams.get("accent")?.trim() || undefined;
  const transcriptAvailable = searchParams.get("transcript_available");
  const limit = Number(searchParams.get("limit") ?? 6);

  if (level && !isOneOf(level, LEVELS)) {
    return NextResponse.json({ error: "level must be one of A1, A2, B1, B2, C1, C2." }, { status: 400 });
  }

  if (!isValidArray(skills, SKILLS)) {
    return NextResponse.json({ error: "skills contains an unsupported value." }, { status: 400 });
  }

  if (topics instanceof NextResponse) {
    return topics;
  }

  return {
    level: level ? (level as VidMatchLevel) : undefined,
    skills: skills as VidMatchSkill[],
    topics,
    accent,
    transcriptAvailable: transcriptAvailable === "true" ? true : undefined,
    limit: Number.isFinite(limit) ? limit : 6,
  };
}

function parseTopics(values: string[]): string[] | NextResponse {
  const topics = values.map((value) => value.trim()).filter(Boolean);

  if (topics.length > MAX_TOPIC_COUNT) {
    return NextResponse.json({ error: `topics must include ${MAX_TOPIC_COUNT} or fewer values.` }, { status: 400 });
  }

  if (topics.some((topic) => topic.length > MAX_TOPIC_LENGTH)) {
    return NextResponse.json({ error: `each topic must be ${MAX_TOPIC_LENGTH} characters or fewer.` }, { status: 400 });
  }

  return Array.from(new Set(topics));
}

function isValidArray<T extends string>(values: unknown[], allowedValues: readonly T[]): values is T[] {
  return values.every((value) => isOneOf(value, allowedValues));
}

function isOneOf<T extends string>(value: unknown, allowedValues: readonly T[]): value is T {
  return typeof value === "string" && allowedValues.includes(value as T);
}
