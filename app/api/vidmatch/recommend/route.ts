import { NextRequest, NextResponse } from "next/server";
import {
  getRecommendedVideos,
  type RecommendVideosInput,
} from "@/apps/vidmatch/src/services/recommendationService";

import { apiError } from "@/app/api/_lib/http";
import { ACCENTS, isYoutubeVideoId, type VidMatchLevel, type VidMatchSkill } from "@/apps/vidmatch/src/services/videoContract";
import { normalizeTopics } from "@/apps/vidmatch/src/services/videoTaxonomy";

export const runtime = "nodejs";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const SKILLS = ["listening", "vocabulary", "pronunciation", "grammar", "conversation"] as const;
const MAX_TOPIC_COUNT = 10;
const MAX_TOPIC_LENGTH = 80;

export async function GET(request: NextRequest) {
  const input = parseRecommendationInput(request.nextUrl.searchParams);
  if (input instanceof NextResponse) return input;

  try {
    return NextResponse.json(await getRecommendedVideos(input));
  } catch (error) {
    return apiError(error, "vidmatch.recommend");
  }
}

function parseRecommendationInput(searchParams: URLSearchParams): RecommendVideosInput | NextResponse {
  const level = searchParams.get("level");
  const skills = searchParams.getAll("skills");
  const topics = parseTopics(searchParams.getAll("topics"));
  const accent = searchParams.get("accent")?.trim() || undefined;
  const transcriptAvailable = searchParams.get("transcript_available");
  const limit = Number(searchParams.get("limit") ?? 6);
  const similarToVideoId = searchParams.get("similar_to")?.trim() || undefined;
  const cursor = searchParams.get("cursor") || undefined;
  if (cursor && cursor.length > 3000) return NextResponse.json({ error: "Invalid recommendation cursor." }, { status: 400 });

  if (level && !isOneOf(level, LEVELS)) {
    return NextResponse.json({ error: "level must be one of A1, A2, B1, B2, C1, C2." }, { status: 400 });
  }

  if (!isValidArray(skills, SKILLS)) {
    return NextResponse.json({ error: "skills contains an unsupported value." }, { status: 400 });
  }

  if (topics instanceof NextResponse) {
    return topics;
  }

  if (similarToVideoId && !isYoutubeVideoId(similarToVideoId)) return NextResponse.json({ error: "similar_to must be a YouTube video ID." }, { status: 400 });
  if (!Number.isInteger(limit) || limit < 1 || limit > 12) return NextResponse.json({ error: "limit must be an integer from 1 to 12." }, { status: 400 });
  if (skills.length > SKILLS.length) return NextResponse.json({ error: "Too many skills." }, { status: 400 });
  if (accent && !ACCENTS.includes(accent as typeof ACCENTS[number])) return NextResponse.json({ error: "Unsupported accent." }, { status: 400 });
  if (transcriptAvailable !== null && transcriptAvailable !== "true" && transcriptAvailable !== "false") return NextResponse.json({ error: "transcript_available must be true or false." }, { status: 400 });

  return {
    level: level ? (level as VidMatchLevel) : undefined,
    skills: skills as VidMatchSkill[],
    topics: normalizeTopics(topics),
    accent,
    transcriptAvailable: transcriptAvailable === null ? undefined : transcriptAvailable === "true",
    limit,
    similarToVideoId,
    cursor,
  };
}

function parseTopics(values: string[]): string[] | NextResponse {
  const topics = values.map((value) => value.trim()).filter(Boolean);

  if (values.length > MAX_TOPIC_COUNT) {
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
