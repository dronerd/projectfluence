import { supabaseServiceHeaders } from "@/app/api/_lib/supabaseAuth";
import "server-only";

import { promises as fs } from "fs";
import path from "path";

import { getRequiredEnv } from "@/app/api/_lib/supabaseAuth";
import { ApiError, fetchWithTimeout } from "@/app/api/_lib/http";

import type { LessonData } from "../lib/content";
import { hydrateReviewWords, buildReviewQuestions, type CatalogWord, type WeakWordSnapshot } from "../lib/reviewPolicy";
export type { ReviewWord } from "../lib/reviewPolicy";
export type { LearningQuestion as ReviewQuestion } from "../lib/content";
export type VocabStreamWeakWordRow = WeakWordSnapshot;
let wordCatalogPromise: Promise<CatalogWord[]> | null = null;

export async function getVocabStreamReview(userId: string) {
  const [weakWords, catalog] = await Promise.all([readWeakWords(userId), loadWordCatalog()]);
  const hydratedWeakWords = hydrateReviewWords(weakWords,catalog);
  return { weakWords: hydratedWeakWords, questions: buildReviewQuestions(hydratedWeakWords,catalog) };
}

async function readWeakWords(userId: string) {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const params = new URLSearchParams({
    select: "id,word,definition,example,explanation,source_category,source_lesson_id,source_lesson_number,mistake_count,last_mistaken_at",
    user_id: `eq.${userId}`,
    order: "mistake_count.desc,last_mistaken_at.desc",
    limit: "500",
  });

  const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1/vocabstream_user_mistakes?${params}`, {
    headers: {
      ...supabaseServiceHeaders(serviceRoleKey),
    },
  });

  if (!response.ok) {
    throw new ApiError(503, "Review words are temporarily unavailable. Please try again.", "REVIEW_UNAVAILABLE");
  }

  return (await response.json()) as VocabStreamWeakWordRow[];
}

export function loadWordCatalog() {
  // Share cold-start work between concurrent requests. A failed read remains retryable.
  wordCatalogPromise ??= readWordCatalog().catch((error) => { wordCatalogPromise = null; throw error; });
  return wordCatalogPromise;
}

async function readWordCatalog() {

  const root = path.join(process.cwd(), "public", "vocabstream", "data");
  const categories = await fs.readdir(root, { withFileTypes: true });
  const catalog: CatalogWord[] = [];

  await Promise.all(categories.filter((category) => category.isDirectory()).map(async (category) => {
    const categoryPath = path.join(root, category.name);
    const files = await fs.readdir(categoryPath);
    for (const file of files) {
      if (!/^Lesson\d+\.json$/i.test(file)) continue;
      const lessonNumber = parseInt(file.match(/\d+/)?.[0] ?? "", 10);
      const raw = await fs.readFile(path.join(categoryPath, file), "utf8");
      const json = JSON.parse(raw) as LessonData;
      const words = Array.isArray(json.words) ? json.words : [];
      for (const word of words) {
        if (!word.word) continue;
        catalog.push({
          ...word,
          sourceCategory: category.name,
          sourceLessonId: `${category.name}-lesson-${lessonNumber}`,
          sourceLessonNumber: lessonNumber,
        });
      }
    }
  }));

  return catalog;
}
