import type { LearningQuestion, LessonWord } from "./lib/content";
import { requestSignal } from "@/lib/browserRequest";
import type { VocabStreamProgressPayload } from "./lib/progressContract";
export type { VocabStreamProgressPayload, VocabStreamQuestionAttempt } from "./lib/progressContract";

export type VocabStreamLessonProgress = {
  lessonId: string;
  percentScore: number;
  totalPossible: number;
  updatedAt: string;
};

export type VocabStreamWeakWord = Pick<LessonWord, "image" | "imageRole" | "definitionType" | "usageNote" | "expressionType"> & {
  word: string;
  definition: string;
  example?: string;
  exampleJapanese?: string;
  explanation?: string;
  japaneseMeaning?: string;
  synonyms?: string;
  antonyms?: string;
  forms?: string;
  mistakeCount: number;
  sourceCategory: string;
  sourceLessonId?: string;
  sourceLessonNumber?: number | null;
  lastMistakenAt?: string;
};

export type VocabStreamReviewQuestion = LearningQuestion;

export async function apiSubmitVocabStreamProgress(payload: VocabStreamProgressPayload, accessToken?: string | null) {
  const deadline = requestSignal(20_000);
  try {
    const res = await fetch("/api/vocabstream/progress", {
      method: "POST",
      signal: deadline.signal,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => null);
      throw new Error(error?.error || "Failed to save VocabStream progress");
    }

    return await res.json();
  } finally { deadline.dispose(); }
}

export async function apiGetVocabStreamLessonProgress(genre: string, accessToken?: string | null) {
  if (!accessToken) return [] as VocabStreamLessonProgress[];

  const deadline = requestSignal(20_000);
  try {
    const params = new URLSearchParams({ genre });
    const res = await fetch(`/api/vocabstream/lesson-progress?${params}`, {
      signal: deadline.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => null);
      throw new Error(error?.error || "Failed to load VocabStream lesson progress");
    }

    const data = (await res.json()) as { progress?: VocabStreamLessonProgress[] };
    return data.progress ?? [];
  } finally { deadline.dispose(); }
}

export async function apiGetVocabStreamReview(accessToken?: string | null) {
  if (!accessToken) return { weakWords: [] as VocabStreamWeakWord[], questions: [] as VocabStreamReviewQuestion[] };

  const deadline = requestSignal(20_000);
  try {
    const res = await fetch("/api/vocabstream/review", {
      signal: deadline.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => null);
      throw new Error(error?.error || "Failed to load VocabStream review");
    }

    return await res.json() as { weakWords: VocabStreamWeakWord[]; questions: VocabStreamReviewQuestion[] };
  } finally { deadline.dispose(); }
}
