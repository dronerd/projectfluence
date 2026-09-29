import { supabaseServiceHeaders } from "@/app/api/_lib/supabaseAuth";
import "server-only";
import { ApiError, fetchWithTimeout } from "@/app/api/_lib/http";
import { getRequiredEnv } from "@/app/api/_lib/supabaseAuth";
import type { VocabStreamProgressPayload } from "../lib/progressContract";

export async function saveVocabStreamProgress(userId: string, input: VocabStreamProgressPayload) {
  const url = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const key = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetchWithTimeout(`${url}/rest/v1/rpc/save_vocabstream_progress`, {
    method: "POST",
    headers: { ...supabaseServiceHeaders(key), "Content-Type": "application/json", Accept: "application/vnd.pgrst.object+json" },
    body: JSON.stringify({
      p_user_id: userId,
      p_attempt_id: input.attemptId,
      p_payload: {
        lesson_id: input.lessonId, genre: input.genre, lesson_number: input.lessonNumber ?? null,
        lesson_title: input.lessonTitle ?? null, word_count: input.wordCount,
        meaning_score: input.meaningScore, meaning_total: input.meaningTotal,
        quiz_score: input.quizScore, quiz_total: input.quizTotal,
        replay_completed: input.replayCompleted ?? false, replay_correct: input.replayCorrect ?? 0, replay_total: input.replayTotal ?? 0,
        question_attempts: input.questionAttempts.map((attempt) => ({
          question_type: attempt.questionType, word: attempt.word, prompt: attempt.prompt ?? null,
          correct_answer: attempt.correctAnswer, selected_answer: attempt.selectedAnswer,
          is_correct: attempt.isCorrect, is_replay: attempt.isReplay ?? false, attempt_order: attempt.attemptOrder,
          choices: attempt.choices ?? [], answered_at: attempt.answeredAt ?? null,
          source_category: attempt.sourceCategory ?? null, source_lesson_id: attempt.sourceLessonId ?? null,
          source_lesson_number: attempt.sourceLessonNumber ?? null, definition: attempt.definition ?? null,
          example: attempt.example ?? null, explanation: attempt.explanation ?? null,
        })),
      },
    }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { code?: string } | null;
    if (data?.code === "22023") throw new ApiError(409, "This result conflicts with an earlier save. Reload the lesson before starting again.", "PROGRESS_CONFLICT");
    if (data?.code === "42501") throw new ApiError(403, "This learning record is unavailable.", "FORBIDDEN");
    throw new ApiError(503, "Learning records could not be saved. Please retry.", "PROGRESS_UNAVAILABLE");
  }
  const row = await response.json() as { id?: unknown };
  if (typeof row?.id !== "string") throw new Error("Invalid progress response");
  return { lessonAttempt: { id: row.id } };
}
