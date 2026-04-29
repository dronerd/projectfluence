import { NextRequest, NextResponse } from "next/server";
import {
  searchAndSaveYoutubeVideos,
  type SearchYoutubeVideosInput,
} from "@/apps/vidmatch/src/services/youtubeVideoService";

export const runtime = "nodejs";

const LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;
const SKILLS = ["listening", "vocabulary", "pronunciation", "grammar", "conversation"] as const;
const TOPICS = ["travel", "school", "business", "daily life", "news"] as const;

type RequestBody = Partial<SearchYoutubeVideosInput>;

export async function POST(request: NextRequest) {
  const authError = validateIngestToken(request);
  if (authError) return authError;

  const body = (await request.json().catch(() => null)) as RequestBody | null;
  const parsedBody = parseBody(body);
  if (parsedBody instanceof NextResponse) return parsedBody;

  const result = await searchAndSaveYoutubeVideos(parsedBody);

  return NextResponse.json(result);
}

function validateIngestToken(request: NextRequest) {
  const ingestToken = process.env.VIDMATCH_INGEST_TOKEN;
  if (!ingestToken) {
    return NextResponse.json({ error: "Missing VIDMATCH_INGEST_TOKEN on the server." }, { status: 500 });
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${ingestToken}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return null;
}

function parseBody(body: RequestBody | null): SearchYoutubeVideosInput | NextResponse {
  if (!body || typeof body.query !== "string" || body.query.trim().length === 0) {
    return NextResponse.json({ error: "Request body must include a non-empty query." }, { status: 400 });
  }

  if (body.level && !isOneOf(body.level, LEVELS)) {
    return NextResponse.json({ error: "level must be one of A1, A2, B1, B2, C1." }, { status: 400 });
  }

  if (body.skills && !isValidArray(body.skills, SKILLS)) {
    return NextResponse.json({ error: "skills contains an unsupported value." }, { status: 400 });
  }

  if (body.topics && !isValidArray(body.topics, TOPICS)) {
    return NextResponse.json({ error: "topics contains an unsupported value." }, { status: 400 });
  }

  return {
    query: body.query.trim(),
    level: body.level,
    skills: body.skills,
    topics: body.topics,
    accent: body.accent?.trim() || undefined,
    maxResults: body.maxResults,
    minQualityScore: body.minQualityScore,
  };
}

function isValidArray<T extends string>(values: unknown, allowedValues: readonly T[]): values is T[] {
  return Array.isArray(values) && values.every((value) => isOneOf(value, allowedValues));
}

function isOneOf<T extends string>(value: unknown, allowedValues: readonly T[]): value is T {
  return typeof value === "string" && allowedValues.includes(value as T);
}
