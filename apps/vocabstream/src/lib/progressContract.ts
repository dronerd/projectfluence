export type VocabStreamQuestionAttempt = {
  questionType: "meaning" | "quiz";
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
  exampleJapanese?: string;
  explanation?: string;
  japaneseMeaning?: string;
  synonyms?: string;
  antonyms?: string;
  forms?: string;
};

export type VocabStreamProgressPayload = {
  /** Stable for this batch, including retries after an uncertain network result. */
  attemptId: string;
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
  questionAttempts: VocabStreamQuestionAttempt[];
};

export class ProgressValidationError extends Error {}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProgressValidationError("Expected a JSON object.");
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string, max = 500, optional = false): string | undefined {
  if (optional && (value === undefined || value === null || value === "")) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new ProgressValidationError(`${name} must be non-empty text of at most ${max} characters.`);
  return value.trim();
}
function integer(value: unknown, name: string, max = 1000): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) throw new ProgressValidationError(`${name} must be an integer between 0 and ${max}.`);
  return value;
}
function optionalBoolean(value: unknown, name: string): boolean {
  if (value !== undefined && typeof value !== "boolean") throw new ProgressValidationError(`${name} must be a boolean.`);
  return value === true;
}
function lessonNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const result = integer(value, "lessonNumber");
  if (!result) throw new ProgressValidationError("lessonNumber must be positive.");
  return result;
}
export function parseVocabStreamProgress(value: unknown): VocabStreamProgressPayload {
  const body = object(value);
  const attemptId = text(body.attemptId, "attemptId", 36)!;
  if (!uuid.test(attemptId)) throw new ProgressValidationError("attemptId must be a UUID.");
  if (!Array.isArray(body.questionAttempts) || body.questionAttempts.length < 1 || body.questionAttempts.length > 500) {
    throw new ProgressValidationError("questionAttempts must contain between 1 and 500 answers.");
  }
  const meaningScore = integer(body.meaningScore, "meaningScore");
  const meaningTotal = integer(body.meaningTotal, "meaningTotal");
  const quizScore = integer(body.quizScore, "quizScore");
  const quizTotal = integer(body.quizTotal, "quizTotal");
  const replayCorrect = integer(body.replayCorrect ?? 0, "replayCorrect");
  const replayTotal = integer(body.replayTotal ?? 0, "replayTotal");
  if (meaningScore > meaningTotal || quizScore > quizTotal || replayCorrect > replayTotal) {
    throw new ProgressValidationError("A score cannot exceed the number of questions.");
  }
  const orders = new Set<number>();
  const questionAttempts = body.questionAttempts.map((value): VocabStreamQuestionAttempt => {
    const attempt = object(value);
    if (attempt.questionType !== "meaning" && attempt.questionType !== "quiz") throw new ProgressValidationError("Invalid question type.");
    const correctAnswer = text(attempt.correctAnswer, "correctAnswer")!;
    const selectedAnswer = text(attempt.selectedAnswer, "selectedAnswer")!;
    if (typeof attempt.isCorrect !== "boolean" || attempt.isCorrect !== (correctAnswer === selectedAnswer)) {
      throw new ProgressValidationError("Answer correctness is inconsistent.");
    }
    const attemptOrder = integer(attempt.attemptOrder, "attemptOrder", 100_000);
    if (orders.has(attemptOrder)) throw new ProgressValidationError("Answer order must be unique within a batch.");
    orders.add(attemptOrder);
    const choices = attempt.choices === undefined ? [] : attempt.choices;
    if (!Array.isArray(choices) || choices.length > 20) throw new ProgressValidationError("Invalid answer choices.");
    const normalizedChoices = choices.map((choice) => text(choice, "choice")!);
    const choiceKeys = normalizedChoices.map(choice => choice.normalize("NFKC").toLowerCase().replace(/\s+/g, " "));
    if (new Set(choiceKeys).size !== choiceKeys.length) throw new ProgressValidationError("Answer choices must be distinct.");
    if (normalizedChoices.length && (!normalizedChoices.includes(correctAnswer) || !normalizedChoices.includes(selectedAnswer))) {
      throw new ProgressValidationError("Answers must be present in the choices.");
    }
    const answeredAt = text(attempt.answeredAt, "answeredAt", 40, true);
    if (answeredAt && !Number.isFinite(Date.parse(answeredAt))) throw new ProgressValidationError("Invalid answer timestamp.");
    return {
      questionType: attempt.questionType, word: text(attempt.word, "word", 200)!, correctAnswer, selectedAnswer,
      isCorrect: attempt.isCorrect, isReplay: optionalBoolean(attempt.isReplay, "isReplay"), attemptOrder,
      prompt: text(attempt.prompt, "prompt", 4000, true), choices: normalizedChoices,
      answeredAt: answeredAt ? new Date(answeredAt).toISOString() : undefined,
      sourceCategory: text(attempt.sourceCategory, "sourceCategory", 100, true),
      sourceLessonId: text(attempt.sourceLessonId, "sourceLessonId", 160, true),
      sourceLessonNumber: lessonNumber(attempt.sourceLessonNumber),
      definition: text(attempt.definition, "definition", 4000, true),
      example: text(attempt.example, "example", 4000, true),
      explanation: text(attempt.explanation, "explanation", 4000, true),
    };
  });
  return {
    attemptId, lessonId: text(body.lessonId, "lessonId", 160)!, genre: text(body.genre, "genre", 100)!,
    lessonNumber: lessonNumber(body.lessonNumber), lessonTitle: text(body.lessonTitle, "lessonTitle", 500, true),
    wordCount: integer(body.wordCount, "wordCount"), meaningScore, meaningTotal, quizScore, quizTotal,
    replayCompleted: optionalBoolean(body.replayCompleted, "replayCompleted"), replayCorrect, replayTotal, questionAttempts,
  };
}
