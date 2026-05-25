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
  sourceCategory?: string;
  sourceLessonId?: string;
  sourceLessonNumber?: number | null;
  definition?: string;
  example?: string;
  explanation?: string;
};

export type SaveVocabStreamProgressInput = {
  userId?: string;
  userEmail?: string | null;
  userDisplayName?: string | null;
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
  user_id: string | null;
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
  const userId = normalizeUuid(input.userId);

  if (userId) {
    await upsertSupabase(
      `${supabaseUrl}/rest/v1/profiles?on_conflict=id`,
      serviceRoleKey,
      {
        id: userId,
        email: normalizeOptionalText(input.userEmail),
        username: normalizeOptionalText(input.userUsername),
        display_name: normalizeOptionalText(input.userDisplayName) ?? normalizeOptionalText(input.userUsername),
        updated_at: new Date().toISOString(),
      },
    );
  }

  const lessonPayload = {
    user_id: userId,
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

  if (userId) {
    await upsertSupabase(
      `${supabaseUrl}/rest/v1/vocabstream_user_lesson_progress?on_conflict=user_id,lesson_id`,
      serviceRoleKey,
      {
        user_id: userId,
        lesson_id: input.lessonId,
        genre: input.genre,
        lesson_number: Number.isFinite(input.lessonNumber) ? input.lessonNumber : null,
        lesson_title: normalizeOptionalText(input.lessonTitle),
        word_count: clampNonNegativeInteger(input.wordCount),
        latest_lesson_attempt_id: lessonAttempt.id,
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
        updated_at: new Date().toISOString(),
      },
    );
  }

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

  if (userId) {
    await recordMistakes({
      supabaseUrl,
      serviceRoleKey,
      userId,
      lessonId: input.lessonId,
      genre: input.genre,
      lessonNumber: input.lessonNumber,
      attempts: input.questionAttempts,
    });
  }

  return { lessonAttempt };
}

async function recordMistakes(input: {
  supabaseUrl: string;
  serviceRoleKey: string;
  userId: string;
  lessonId: string;
  genre: string;
  lessonNumber?: number | null;
  attempts: VocabStreamQuestionAttemptInput[];
}) {
  const mistakenAttempts = input.attempts.filter((attempt) => !attempt.isCorrect && normalizeOptionalText(attempt.word));
  if (mistakenAttempts.length === 0) return;

  const now = new Date().toISOString();
  const grouped = new Map<string, { attempt: VocabStreamQuestionAttemptInput; count: number }>();
  for (const attempt of mistakenAttempts) {
    const sourceCategory = normalizeOptionalText(attempt.sourceCategory) ?? input.genre;
    const word = normalizeOptionalText(attempt.word);
    if (!word) continue;
    const key = `${sourceCategory.toLowerCase()}::${word.toLowerCase()}`;
    const previous = grouped.get(key);
    grouped.set(key, {
      attempt: {
        ...previous?.attempt,
        ...attempt,
        sourceCategory,
      },
      count: (previous?.count ?? 0) + 1,
    });
  }

  for (const { attempt, count } of grouped.values()) {
    const word = normalizeOptionalText(attempt.word);
    if (!word) continue;
    const sourceCategory = normalizeOptionalText(attempt.sourceCategory) ?? input.genre;
    const sourceLessonId = normalizeOptionalText(attempt.sourceLessonId) ?? input.lessonId;
    const sourceLessonNumber =
      Number.isFinite(attempt.sourceLessonNumber) ? attempt.sourceLessonNumber : input.lessonNumber ?? null;
    const existing = await readMistakeRow(input.supabaseUrl, input.serviceRoleKey, input.userId, sourceCategory, word);
    const payload = {
      user_id: input.userId,
      word,
      word_key: word.toLowerCase(),
      definition: normalizeOptionalText(attempt.definition) ?? normalizeOptionalText(attempt.prompt) ?? "",
      example: normalizeOptionalText(attempt.example),
      explanation: normalizeOptionalText(attempt.explanation),
      source_category: sourceCategory,
      source_lesson_id: sourceLessonId,
      source_lesson_number: Number.isFinite(sourceLessonNumber) ? sourceLessonNumber : null,
      mistake_count: (existing?.mistake_count ?? 0) + count,
      last_question_type: attempt.questionType,
      last_prompt: normalizeOptionalText(attempt.prompt),
      last_correct_answer: attempt.correctAnswer,
      last_selected_answer: attempt.selectedAnswer,
      last_mistaken_at: now,
      updated_at: now,
    };

    await upsertSupabase(
      `${input.supabaseUrl}/rest/v1/vocabstream_user_mistakes?on_conflict=user_id,source_category,word_key`,
      input.serviceRoleKey,
      payload,
    );
  }
}

async function readMistakeRow(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  sourceCategory: string,
  word: string,
): Promise<{ mistake_count: number } | null> {
  const params = new URLSearchParams({
    select: "mistake_count",
    user_id: `eq.${userId}`,
    source_category: `eq.${sourceCategory}`,
    word_key: `eq.${word.toLowerCase()}`,
    limit: "1",
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/vocabstream_user_mistakes?${params}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as SupabaseError | null;
    throw new Error(error?.message ?? `Supabase mistake read failed with status ${response.status}`);
  }

  const rows = (await response.json()) as { mistake_count: number }[];
  return rows[0] ?? null;
}

async function upsertSupabase(url: string, serviceRoleKey: string, payload: unknown): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as SupabaseError | null;
    throw new Error(error?.message ?? `Supabase upsert failed with status ${response.status}`);
  }
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

function normalizeUuid(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
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
