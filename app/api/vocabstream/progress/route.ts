import { NextRequest, NextResponse } from "next/server";
import {
  saveVocabStreamProgress,
  type SaveVocabStreamProgressInput,
  type VocabStreamQuestionAttemptInput,
} from "@/apps/vocabstream/src/services/progressService";

export const runtime = "nodejs";

type RequestBody = Partial<SaveVocabStreamProgressInput>;

const QUESTION_TYPES = ["meaning", "quiz"] as const;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as RequestBody | null;
  const parsedBody = parseBody(body);
  if (parsedBody instanceof NextResponse) return parsedBody;

  try {
    const result = await saveVocabStreamProgress(parsedBody);
    return NextResponse.json({ ok: true, lessonAttemptId: result.lessonAttempt.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Progress tracking failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseBody(body: RequestBody | null): SaveVocabStreamProgressInput | NextResponse {
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  if (!isNonEmptyString(body.lessonId)) {
    return NextResponse.json({ error: "lessonId is required." }, { status: 400 });
  }

  if (!isNonEmptyString(body.genre)) {
    return NextResponse.json({ error: "genre is required." }, { status: 400 });
  }

  if (!Array.isArray(body.questionAttempts)) {
    return NextResponse.json({ error: "questionAttempts must be an array." }, { status: 400 });
  }

  const questionAttempts: VocabStreamQuestionAttemptInput[] = [];
  for (const attempt of body.questionAttempts) {
    const parsedAttempt = parseQuestionAttempt(attempt);
    if (!parsedAttempt) {
      return NextResponse.json({ error: "questionAttempts contains an invalid attempt." }, { status: 400 });
    }
    questionAttempts.push(parsedAttempt);
  }

  return {
    anonymousUserId: optionalString(body.anonymousUserId),
    userUsername: optionalString(body.userUsername),
    lessonId: body.lessonId.trim(),
    genre: body.genre.trim(),
    lessonNumber: optionalNumber(body.lessonNumber),
    lessonTitle: optionalString(body.lessonTitle),
    wordCount: requiredNumber(body.wordCount),
    meaningScore: requiredNumber(body.meaningScore),
    meaningTotal: requiredNumber(body.meaningTotal),
    quizScore: requiredNumber(body.quizScore),
    quizTotal: requiredNumber(body.quizTotal),
    replayCompleted: Boolean(body.replayCompleted),
    replayCorrect: optionalNumber(body.replayCorrect) ?? 0,
    replayTotal: optionalNumber(body.replayTotal) ?? 0,
    questionAttempts,
  };
}

function parseQuestionAttempt(value: unknown): VocabStreamQuestionAttemptInput | null {
  if (!value || typeof value !== "object") return null;
  const attempt = value as Partial<VocabStreamQuestionAttemptInput>;

  if (!isOneOf(attempt.questionType, QUESTION_TYPES)) return null;
  if (!isNonEmptyString(attempt.word)) return null;
  if (!isNonEmptyString(attempt.correctAnswer)) return null;
  if (!isNonEmptyString(attempt.selectedAnswer)) return null;
  if (typeof attempt.isCorrect !== "boolean") return null;

  return {
    questionType: attempt.questionType,
    word: attempt.word.trim(),
    prompt: optionalString(attempt.prompt),
    correctAnswer: attempt.correctAnswer.trim(),
    selectedAnswer: attempt.selectedAnswer.trim(),
    isCorrect: attempt.isCorrect,
    isReplay: Boolean(attempt.isReplay),
    attemptOrder: requiredNumber(attempt.attemptOrder),
    choices: Array.isArray(attempt.choices) ? attempt.choices.filter(isNonEmptyString).map((choice) => choice.trim()) : [],
    answeredAt: optionalString(attempt.answeredAt),
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value: unknown) {
  return isNonEmptyString(value) ? value.trim() : undefined;
}

function optionalNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function requiredNumber(value: unknown) {
  return optionalNumber(value) ?? 0;
}

function isOneOf<T extends string>(value: unknown, allowedValues: readonly T[]): value is T {
  return typeof value === "string" && allowedValues.includes(value as T);
}
