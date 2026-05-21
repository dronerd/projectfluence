import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getRequiredEnv } from "@/app/api/_lib/supabaseAuth";

export const runtime = "nodejs";

type VocabProgressRow = {
  lesson_id: string;
  genre: string;
  percent_score: number | string;
  total_possible: number | string;
  updated_at: string;
};

type VidMatchHistoryRow = {
  video_id: string;
  level: string | null;
  click_count: number | string | null;
  last_clicked_at: string;
};

type SpeakWiseSessionRow = {
  mode: string | null;
  level: string | null;
  planned_duration_minutes: number | string | null;
  started_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Login is required to view analytics." }, { status: 401 });
    }

    const [vocabRows, vidmatchRows, speakwiseRows] = await Promise.all([
      readVocabProgress(authUser.id),
      readVidMatchHistory(authUser.id),
      readSpeakWiseSessions(authUser.id),
    ]);

    return NextResponse.json({
      vocabstream: summarizeVocab(vocabRows),
      vidmatch: summarizeVidMatch(vidmatchRows),
      speakwise: summarizeSpeakWise(speakwiseRows),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analytics lookup failed";
    const status = message === "Invalid Supabase session." ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

async function readVocabProgress(userId: string) {
  const params = new URLSearchParams({
    select: "lesson_id,genre,percent_score,total_possible,updated_at",
    user_id: `eq.${userId}`,
    order: "updated_at.desc",
  });

  return readSupabaseRows<VocabProgressRow>(`vocabstream_user_lesson_progress?${params}`);
}

async function readVidMatchHistory(userId: string) {
  const params = new URLSearchParams({
    select: "video_id,level,click_count,last_clicked_at",
    user_id: `eq.${userId}`,
    order: "last_clicked_at.desc",
  });

  return readSupabaseRows<VidMatchHistoryRow>(`vidmatch_video_view_history?${params}`);
}

async function readSpeakWiseSessions(userId: string) {
  const params = new URLSearchParams({
    select: "mode,level,planned_duration_minutes,started_at",
    user_id: `eq.${userId}`,
    order: "started_at.desc",
  });

  return readSupabaseRows<SpeakWiseSessionRow>(`speakwise_lesson_sessions?${params}`);
}

async function readSupabaseRows<T>(path: string): Promise<T[]> {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    console.warn(error?.message ?? `Supabase analytics read failed with status ${response.status}`);
    return [];
  }

  return response.json() as Promise<T[]>;
}

function summarizeVocab(rows: VocabProgressRow[]) {
  const completedRows = rows.filter((row) => toNumber(row.total_possible) > 0);
  const lowScoreRows = completedRows.filter((row) => toNumber(row.percent_score) < 60);
  const averageAccuracy = completedRows.length
    ? completedRows.reduce((sum, row) => sum + toNumber(row.percent_score), 0) / completedRows.length
    : 0;

  return {
    completedLessons: completedRows.length,
    lowScoreLessons: lowScoreRows.length,
    averageAccuracy,
    byGenre: toCounts(completedRows.map((row) => row.genre || "Unknown")),
    latestActivityAt: completedRows[0]?.updated_at ?? null,
  };
}

function summarizeVidMatch(rows: VidMatchHistoryRow[]) {
  return {
    savedVideos: rows.length,
    totalClicks: rows.reduce((sum, row) => sum + Math.max(1, toNumber(row.click_count)), 0),
    byLevel: toCounts(rows.map((row) => row.level || "Unknown")),
    latestActivityAt: rows[0]?.last_clicked_at ?? null,
  };
}

function summarizeSpeakWise(rows: SpeakWiseSessionRow[]) {
  const totalMinutes = rows.reduce((sum, row) => sum + toNumber(row.planned_duration_minutes), 0);

  return {
    lessonSessions: rows.length,
    totalMinutes,
    byMode: toCounts(rows.map((row) => row.mode || "Unknown")),
    byLevel: toCounts(rows.map((row) => row.level || "Unknown")),
    latestActivityAt: rows[0]?.started_at ?? null,
  };
}

function toCounts(values: string[]) {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function toNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}
