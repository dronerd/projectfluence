import { NextRequest, NextResponse } from "next/server";
import {
  searchAndSaveYoutubeVideos,
  type SearchYoutubeVideosInput,
} from "@/apps/vidmatch/src/services/youtubeVideoService";

export const runtime = "nodejs";

const DAILY_SEARCHES: SearchYoutubeVideosInput[] = [
  {
    query: "English listening practice education A2",
    level: "A2",
    skills: ["listening", "conversation"],
    topics: ["Education & Learning"],
    maxResults: 1,
    minQualityScore: 70,
  },
  {
    query: "English listening practice medicine and health B1",
    level: "B1",
    skills: ["listening", "vocabulary"],
    topics: ["Medicine & Health"],
    maxResults: 1,
    minQualityScore: 70,
  },
  {
    query: "Business English conversation B2",
    level: "B2",
    skills: ["listening", "conversation", "vocabulary"],
    topics: ["Business & Economics"],
    maxResults: 1,
    minQualityScore: 70,
  },
  {
    query: "English discussion law and politics C1",
    level: "C1",
    skills: ["listening", "vocabulary"],
    topics: ["Law & Politics"],
    maxResults: 1,
    minQualityScore: 70,
  },
  {
    query: "English pronunciation practice art and culture A1",
    level: "A1",
    skills: ["pronunciation", "listening"],
    topics: ["Art & Culture"],
    maxResults: 1,
    minQualityScore: 70,
  },
  {
    query: "English lecture computer science and technology C2",
    level: "C2",
    skills: ["listening", "vocabulary"],
    topics: ["Computer Science & Technology"],
    maxResults: 1,
    minQualityScore: 70,
  },
  {
    query: "English listening engineering sustainability B2",
    level: "B2",
    skills: ["listening", "conversation"],
    topics: ["Engineering", "Environmental Science & Sustainability"],
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
