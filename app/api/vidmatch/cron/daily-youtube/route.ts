import { NextRequest, NextResponse } from "next/server";
import {
  searchAndSaveYoutubeVideos,
  type SearchYoutubeVideosInput,
} from "@/apps/vidmatch/src/services/youtubeVideoService";

export const runtime = "nodejs";

const DAILY_SEARCHES: SearchYoutubeVideosInput[] = [
  {
    query: "English listening practice daily life A2",
    level: "A2",
    skills: ["listening", "conversation"],
    topics: ["daily life"],
    maxResults: 1,
    minQualityScore: 70,
  },
  {
    query: "English listening practice travel B1",
    level: "B1",
    skills: ["listening", "vocabulary"],
    topics: ["travel"],
    maxResults: 1,
    minQualityScore: 70,
  },
  {
    query: "Business English conversation B2",
    level: "B2",
    skills: ["listening", "conversation", "vocabulary"],
    topics: ["business"],
    maxResults: 1,
    minQualityScore: 70,
  },
  {
    query: "English news listening practice C1",
    level: "C1",
    skills: ["listening", "vocabulary"],
    topics: ["news"],
    maxResults: 1,
    minQualityScore: 70,
  },
  {
    query: "English pronunciation practice school A1",
    level: "A1",
    skills: ["pronunciation", "listening"],
    topics: ["school"],
    maxResults: 1,
    minQualityScore: 70,
  },
];

export async function GET(request: NextRequest) {
  const authError = validateCronSecret(request);
  if (authError) return authError;

  const search = getDailySearch();
  const result = await searchAndSaveYoutubeVideos(search);

  return NextResponse.json({
    ok: true,
    search,
    result,
  });
}

function validateCronSecret(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Missing CRON_SECRET on the server." }, { status: 500 });
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return null;
}

function getDailySearch() {
  const daysSinceEpoch = Math.floor(Date.now() / 86_400_000);
  return DAILY_SEARCHES[daysSinceEpoch % DAILY_SEARCHES.length];
}
