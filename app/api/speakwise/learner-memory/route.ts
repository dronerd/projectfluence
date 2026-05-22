import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getRequiredEnv } from "@/app/api/_lib/supabaseAuth";

export const runtime = "nodejs";

type MemoryWriteBody = {
  sessionId?: unknown;
  lessonMode?: unknown;
  level?: unknown;
  durationMinutes?: unknown;
  elapsedSeconds?: unknown;
  topics?: unknown;
  summary?: unknown;
};

type SupabaseRow = Record<string, unknown>;

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return NextResponse.json(emptyMemory());

    const memory = await loadLearnerMemory(authUser.id);
    return NextResponse.json(memory);
  } catch (error) {
    const message = error instanceof Error ? error.message : "SpeakWise learner memory lookup failed";
    const status = message === "Invalid Supabase session." ? 401 : 500;
    return NextResponse.json({ error: message, ...emptyMemory() }, { status });
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as MemoryWriteBody | null;
  if (!body || !isPlainObject(body.summary)) {
    return NextResponse.json({ error: "summary must be a JSON object." }, { status: 400 });
  }

  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Login is required to save SpeakWise learner memory." }, { status: 401 });
    }

    const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const summary = body.summary as Record<string, unknown>;
    const mistakes = Array.isArray(summary.mistakes) ? summary.mistakes.filter(isPlainObject) : [];

    await writeSupabase(`${supabaseUrl}/rest/v1/speakwise_lesson_summaries`, serviceRoleKey, {
      user_id: authUser.id,
      session_id: typeof body.sessionId === "string" && body.sessionId ? body.sessionId : null,
      lesson_mode: typeof body.lessonMode === "string" ? body.lessonMode : "natural_conversation",
      level: typeof body.level === "string" ? body.level : "B2",
      topics: stringArray(body.topics),
      duration_minutes: boundedNumber(body.durationMinutes, 0, 240),
      elapsed_seconds: boundedNumber(body.elapsedSeconds, 0, 24 * 60 * 60),
      summary,
      mistakes,
      recommendations: stringArray(summary.recommendations),
      useful_vocabulary: stringArray(summary.usefulVocabulary),
    });

    for (const mistake of mistakes) {
      await saveMistakePattern(supabaseUrl, serviceRoleKey, authUser.id, mistake);
    }

    const memory = await loadLearnerMemory(authUser.id);
    return NextResponse.json({ ok: true, memory });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SpeakWise learner memory save failed";
    const status = message === "Invalid Supabase session." ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

async function loadLearnerMemory(userId: string) {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const [
    recentSummaries,
    mistakePatterns,
    vocabProgress,
    weakVocabItems,
    vidmatchHistory,
  ] = await Promise.all([
    readSupabase(`${supabaseUrl}/rest/v1/speakwise_lesson_summaries?${new URLSearchParams({
      select: "id,lesson_mode,level,topics,summary,mistakes,recommendations,useful_vocabulary,created_at",
      user_id: `eq.${userId}`,
      order: "created_at.desc",
      limit: "5",
    })}`, serviceRoleKey),
    readSupabase(`${supabaseUrl}/rest/v1/speakwise_mistake_patterns?${new URLSearchParams({
      select: "mistake_type,pattern,count,latest_original,latest_correction,latest_explanation,last_seen_at",
      user_id: `eq.${userId}`,
      order: "count.desc,last_seen_at.desc",
      limit: "10",
    })}`, serviceRoleKey),
    readSupabase(`${supabaseUrl}/rest/v1/vocabstream_user_lesson_progress?${new URLSearchParams({
      select: "lesson_id,genre,lesson_number,lesson_title,word_count,percent_score,meaning_score,meaning_total,quiz_score,quiz_total,updated_at",
      user_id: `eq.${userId}`,
      order: "updated_at.desc",
      limit: "8",
    })}`, serviceRoleKey),
    readSupabase(`${supabaseUrl}/rest/v1/vocabstream_question_attempts?select=word,correct_answer,selected_answer,question_type,is_correct,answered_at,vocabstream_lesson_attempts!inner(user_id,genre,lesson_title)&vocabstream_lesson_attempts.user_id=eq.${userId}&is_correct=eq.false&order=answered_at.desc&limit=12`, serviceRoleKey),
    readSupabase(`${supabaseUrl}/rest/v1/vidmatch_video_view_history?${new URLSearchParams({
      select: "video_id,title,channel_name,level,skills,topics,accent,last_clicked_at,click_count",
      user_id: `eq.${userId}`,
      order: "last_clicked_at.desc",
      limit: "6",
    })}`, serviceRoleKey),
  ]);

  return {
    recentSummaries,
    mistakePatterns,
    vocabProgress,
    weakVocabItems,
    vidmatchHistory,
    recommendations: recentSummaries.flatMap((row) => stringArray((row.summary as Record<string, unknown> | undefined)?.recommendations)).slice(0, 8),
  };
}

async function readSupabase(url: string, serviceRoleKey: string): Promise<SupabaseRow[]> {
  const response = await fetch(url, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  if (!response.ok) return [];
  const data = await response.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

async function writeSupabase(url: string, serviceRoleKey: string, payload: unknown, prefer = "return=minimal") {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? `Supabase write failed with status ${response.status}`);
  }
}

async function saveMistakePattern(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  mistake: Record<string, unknown>,
) {
  const mistakeType = String(mistake.type || "expression").slice(0, 80);
  const pattern = String(mistake.pattern || mistake.explanation || mistake.type || "expression").slice(0, 240);
  const latest = {
    latest_original: nullableString(mistake.original, 400),
    latest_correction: nullableString(mistake.correction, 400),
    latest_explanation: nullableString(mistake.explanation, 400),
    last_seen_at: new Date().toISOString(),
  };
  const params = new URLSearchParams({
    select: "id,count",
    user_id: `eq.${userId}`,
    mistake_type: `eq.${mistakeType}`,
    pattern: `eq.${pattern}`,
    limit: "1",
  });
  const existing = await readSupabase(`${supabaseUrl}/rest/v1/speakwise_mistake_patterns?${params}`, serviceRoleKey);
  const current = existing[0] as { id?: string; count?: number } | undefined;

  if (current?.id) {
    await patchSupabase(`${supabaseUrl}/rest/v1/speakwise_mistake_patterns?id=eq.${current.id}`, serviceRoleKey, {
      ...latest,
      count: Number(current.count || 1) + 1,
    });
    return;
  }

  await writeSupabase(`${supabaseUrl}/rest/v1/speakwise_mistake_patterns`, serviceRoleKey, {
    user_id: userId,
    mistake_type: mistakeType,
    pattern,
    ...latest,
  });
}

async function patchSupabase(url: string, serviceRoleKey: string, payload: unknown) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? `Supabase patch failed with status ${response.status}`);
  }
}

function emptyMemory() {
  return {
    recentSummaries: [],
    mistakePatterns: [],
    vocabProgress: [],
    weakVocabItems: [],
    vidmatchHistory: [],
    recommendations: [],
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function nullableString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function boundedNumber(value: unknown, minimum: number, maximum: number) {
  const parsed = Math.round(Number(value) || 0);
  return Math.max(minimum, Math.min(maximum, parsed));
}
