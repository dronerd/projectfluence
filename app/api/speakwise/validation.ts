import { ApiError, isPlainObject } from "../_lib/http.ts";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const MODES = ["natural_conversation", "vocabulary_phrase", "grammar_practice", "speaking_practice", "pronunciation_practice", "listening_practice", "reading_comprehension", "pdf_reading", "writing_feedback", "deep_discussion", "review_weakness"];
const invalid = (message: string) => new ApiError(400, message, "INVALID_LESSON");

export function stringList(value: unknown, maxItems = 30, maxLength = 500): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems || value.some(item => typeof item !== "string" || item.length > maxLength)) throw invalid("The lesson contains an invalid list.");
  return value.map(item => (item as string).trim()).filter(Boolean);
}

function integer(value: unknown, maximum: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > maximum) throw invalid("The lesson duration is invalid.");
  return value;
}

export function parseLessonFields(body: Record<string, unknown>) {
  const level = body.level ?? "B2";
  const lessonMode = body.lessonMode ?? "natural_conversation";
  if (typeof level !== "string" || !LEVELS.includes(level)) throw invalid("The lesson level is invalid.");
  if (typeof lessonMode !== "string" || !MODES.includes(lessonMode)) throw invalid("The lesson mode is invalid.");
  if (body.mode !== undefined && body.mode !== "speaking" && body.mode !== "writing") throw invalid("The practice mode is invalid.");
  return {
    level, lessonMode, mode: lessonMode === "writing_feedback" ? "writing" : "speaking",
    durationMinutes: integer(body.plannedDurationMinutes ?? body.durationMinutes ?? 0, 240),
    elapsedSeconds: integer(body.elapsedSeconds ?? 0, 86_400),
    topics: stringList(body.selectedTopics ?? body.topics, 20, 200),
  };
}

export function parseSummaryBody(value: unknown) {
  if (!isPlainObject(value) || !isPlainObject(value.summary)) throw invalid("summary must be a JSON object.");
  if (typeof value.sessionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.sessionId)) throw invalid("A saved lesson session is required.");
  const fields = parseLessonFields(value);
  const source = value.summary;
  if (source.title !== undefined && (typeof source.title !== "string" || source.title.length > 500)) throw invalid("The summary title is invalid.");
  if (source.mistakes !== undefined && (!Array.isArray(source.mistakes) || source.mistakes.length > 30)) throw invalid("The summary contains too many mistakes.");
  const mistakes = ((source.mistakes ?? []) as unknown[]).map(mistake => {
    if (!isPlainObject(mistake)) throw invalid("The summary contains an invalid mistake.");
    const result: Record<string, string> = {};
    for (const key of ["type", "pattern", "original", "correction", "explanation"]) {
      if (mistake[key] !== undefined && (typeof mistake[key] !== "string" || mistake[key].length > 1000)) throw invalid("The summary contains an invalid mistake.");
      if (typeof mistake[key] === "string") result[key] = mistake[key];
    }
    return result;
  });
  const summary = {
    title: source.title, covered: stringList(source.covered), strengths: stringList(source.strengths),
    weaknesses: stringList(source.weaknesses), recommendations: stringList(source.recommendations),
    usefulVocabulary: stringList(source.usefulVocabulary), mistakes,
  };
  return { sessionId: value.sessionId, payload: {
    lesson_mode: fields.lessonMode, level: fields.level, topics: fields.topics,
    duration_minutes: fields.durationMinutes, elapsed_seconds: fields.elapsedSeconds,
    summary, mistakes, recommendations: summary.recommendations, useful_vocabulary: summary.usefulVocabulary,
  } };
}
