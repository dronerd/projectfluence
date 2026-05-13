import "server-only";

export type VocabStreamQuestionType = "meaning" | "quiz";

export type VocabStreamQuestionAttemptInput = {
  questionType: VocabStreamQuestionType;
  word: string;
  prompt?: string;
  correctAnswer: string;
  selectedAnswer: string;
  isCorrect: boolean;
  isReplay?: boolean;
  attemptOrder: number;
  choices?: string[];
  answeredAt?: string;
};

export type SaveVocabStreamProgressInput = {
  anonymousUserId?: string;
  userUsername?: string;
  lessonId: string;
  genre: string;
  lessonNumber?: number | null;
  lessonTitle?: string | null;
  wordCount: number;
  meaningScore: number;
  meaningTotal: number;
  quizScore: number;
  quizTotal: number;
  replayCompleted?: boolean;
  replayCorrect?: number;
  replayTotal?: number;
  questionAttempts: VocabStreamQuestionAttemptInput[];
};

type SupabaseError = {
  message?: string;
  details?: string;
  hint?: string;
};

type VocabStreamLessonAttemptRow = {
  id: string;
  anonymous_user_id: string | null;
  user_username: string | null;
  lesson_id: string;
  genre: string;
  lesson_number: number | null;
  lesson_title: string | null;
  word_count: number;
  meaning_score: number;
  meaning_total: number;
  quiz_score: number;
  quiz_total: number;
  total_score: number;
  total_possible: number;
  percent_score: number;
  replay_completed: boolean;
  replay_correct: number;
  replay_total: number;
  created_at?: string;
};

export async function saveVocabStreamProgress(input: SaveVocabStreamProgressInput) {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const totalScore = clampNonNegativeInteger(input.meaningScore) + clampNonNegativeInteger(input.quizScore);
  const totalPossible = clampNonNegativeInteger(input.meaningTotal) + clampNonNegativeInteger(input.quizTotal);
  const percentScore = totalPossible ? Math.round((totalScore / totalPossible) * 100) : 0;

  const lessonPayload = {
    anonymous_user_id: normalizeOptionalText(input.anonymousUserId),
    user_username: normalizeOptionalText(input.userUsername),
    lesson_id: input.lessonId,
    genre: input.genre,
    lesson_number: Number.isFinite(input.lessonNumber) ? input.lessonNumber : null,
    lesson_title: normalizeOptionalText(input.lessonTitle),
    word_count: clampNonNegativeInteger(input.wordCount),
    meaning_score: clampNonNegativeInteger(input.meaningScore),
    meaning_total: clampNonNegativeInteger(input.meaningTotal),
    quiz_score: clampNonNegativeInteger(input.quizScore),
    quiz_total: clampNonNegativeInteger(input.quizTotal),
    total_score: totalScore,
    total_possible: totalPossible,
    percent_score: percentScore,
    replay_completed: Boolean(input.replayCompleted),
    replay_correct: clampNonNegativeInteger(input.replayCorrect ?? 0),
    replay_total: clampNonNegativeInteger(input.replayTotal ?? 0),
  };

  const lessonAttempt = await insertSupabase<VocabStreamLessonAttemptRow>(
    `${supabaseUrl}/rest/v1/vocabstream_lesson_attempts`,
    serviceRoleKey,
    lessonPayload,
  );

  const questionRows = input.questionAttempts.map((attempt) => ({
    lesson_attempt_id: lessonAttempt.id,
    question_type: attempt.questionType,
    word: attempt.word,
    prompt: normalizeOptionalText(attempt.prompt),
    correct_answer: attempt.correctAnswer,
    selected_answer: attempt.selectedAnswer,
    is_correct: attempt.isCorrect,
    is_replay: Boolean(attempt.isReplay),
    attempt_order: clampNonNegativeInteger(attempt.attemptOrder),
    choices: Array.isArray(attempt.choices) ? attempt.choices : [],
    answered_at: normalizeIsoDate(attempt.answeredAt),
  }));

  if (questionRows.length > 0) {
    await insertSupabase(`${supabaseUrl}/rest/v1/vocabstream_question_attempts`, serviceRoleKey, questionRows);
  }

  return { lessonAttempt };
}

async function insertSupabase<T>(url: string, serviceRoleKey: string, payload: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as SupabaseError | null;
    throw new Error(error?.message ?? `Supabase progress insert failed with status ${response.status}`);
  }

  const rows = (await response.json()) as T[];
  if (!rows[0]) throw new Error("Supabase progress insert returned no rows.");
  return rows[0];
}

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeIsoDate(value: unknown) {
  if (typeof value !== "string") return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function clampNonNegativeInteger(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}
