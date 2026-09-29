import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/app/api/_lib/supabaseAuth";
import { apiError, ApiError, readJsonBody } from "@/app/api/_lib/http";
import { supabaseRest } from "@/app/api/_lib/supabaseRest";
import { parseSummaryBody, stringList } from "../validation";

export const runtime = "nodejs";
type SupabaseRow = Record<string, unknown>;

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json(emptyMemory());
    return NextResponse.json(await loadLearnerMemory(user.id));
  } catch (error) {
    return apiError(error, "speakwise.memory.read");
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) throw new ApiError(401, "Login is required to save SpeakWise learner memory.", "LOGIN_REQUIRED");
    const parsed = parseSummaryBody(await readJsonBody(request));
    await supabaseRest("rpc/save_speakwise_lesson_summary", {
      method: "POST", body: JSON.stringify({ p_user_id: user.id, p_session_id: parsed.sessionId, p_payload: parsed.payload }),
    });
    // The write has committed. A failed refresh must not misreport it as a failed save.
    try {
      return NextResponse.json({ ok: true, memory: await loadLearnerMemory(user.id) });
    } catch {
      console.warn(JSON.stringify({ event: "memory_refresh_failed", context: "speakwise.memory.write" }));
      return NextResponse.json({ ok: true, memory: null, refreshRequired: true });
    }
  } catch (error) {
    return apiError(error, "speakwise.memory.write");
  }
}

async function loadLearnerMemory(userId: string) {

  const [
    recentSummaries,
    mistakePatterns,
    vocabProgress,
    weakVocabItems,
    vidmatchHistory,
  ] = await Promise.all([
    supabaseRest<SupabaseRow[]>(`speakwise_lesson_summaries?${new URLSearchParams({
      select: "id,lesson_mode,level,topics,summary,mistakes,recommendations,useful_vocabulary,created_at",
      user_id: `eq.${userId}`,
      order: "created_at.desc",
      limit: "5",
    })}`),
    supabaseRest<SupabaseRow[]>(`speakwise_mistake_patterns?${new URLSearchParams({
      select: "mistake_type,pattern,count,latest_original,latest_correction,latest_explanation,last_seen_at",
      user_id: `eq.${userId}`,
      order: "count.desc,last_seen_at.desc",
      limit: "10",
    })}`),
    supabaseRest<SupabaseRow[]>(`vocabstream_user_lesson_progress?${new URLSearchParams({
      select: "lesson_id,genre,lesson_number,lesson_title,word_count,percent_score,meaning_score,meaning_total,quiz_score,quiz_total,updated_at",
      user_id: `eq.${userId}`,
      order: "updated_at.desc",
      limit: "8",
    })}`),
    supabaseRest<SupabaseRow[]>(`vocabstream_question_attempts?select=word,correct_answer,selected_answer,question_type,is_correct,answered_at,vocabstream_lesson_attempts!inner(user_id,genre,lesson_title)&vocabstream_lesson_attempts.user_id=eq.${userId}&is_correct=eq.false&order=answered_at.desc&limit=12`),
    supabaseRest<SupabaseRow[]>(`vidmatch_video_view_history?${new URLSearchParams({
      select: "video_id,title,channel_name,level,skills,topics,accent,last_clicked_at,click_count",
      user_id: `eq.${userId}`,
      order: "last_clicked_at.desc",
      limit: "6",
    })}`),
  ]);

  return {
    recentSummaries,
    mistakePatterns,
    vocabProgress,
    weakVocabItems,
    vidmatchHistory,
    recommendations: recentSummaries.flatMap((row) => storedStringList((row.summary as Record<string, unknown> | undefined)?.recommendations)).slice(0, 8),
  };
}

function storedStringList(value: unknown) {
  // Stored historical rows may predate validation; they must not break a memory read.
  return Array.isArray(value) ? stringList(value.filter((item): item is string => typeof item === "string").slice(0, 30).map(item => item.slice(0, 500))) : [];
}

function emptyMemory() {
  return { recentSummaries: [], mistakePatterns: [], vocabProgress: [], weakVocabItems: [], vidmatchHistory: [], recommendations: [] };
}
