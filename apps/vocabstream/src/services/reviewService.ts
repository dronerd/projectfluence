import "server-only";

import { promises as fs } from "fs";
import path from "path";

import { getRequiredEnv } from "@/app/api/_lib/supabaseAuth";

export type VocabStreamWeakWordRow = {
  word: string;
  definition: string | null;
  example: string | null;
  explanation: string | null;
  source_category: string;
  source_lesson_id: string | null;
  source_lesson_number: number | null;
  mistake_count: number;
  last_mistaken_at: string;
};

export type ReviewWord = {
  word: string;
  definition: string;
  example?: string;
  explanation?: string;
  japaneseMeaning?: string;
  synonyms?: string;
  antonyms?: string;
  forms?: string;
  sourceCategory: string;
  sourceLessonId?: string;
  sourceLessonNumber?: number | null;
  mistakeCount: number;
  lastMistakenAt?: string;
};

export type ReviewQuestion = {
  id: string;
  questionType: "meaning" | "quiz";
  word: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
  correctAnswer: string;
  definition: string;
  example?: string;
  explanation?: string;
  japaneseMeaning?: string;
  synonyms?: string;
  antonyms?: string;
  forms?: string;
  sourceCategory: string;
  sourceLessonId?: string;
  sourceLessonNumber?: number | null;
};

type LessonWord = {
  word?: string;
  meaning?: string;
  japaneseMeaning?: string;
  example?: string;
  explanation?: string;
  synonyms?: string;
  antonyms?: string;
  forms?: string;
};

type WordCatalogItem = {
  word: string;
  definition: string;
  example?: string;
  explanation?: string;
  japaneseMeaning?: string;
  synonyms?: string;
  antonyms?: string;
  forms?: string;
  sourceCategory: string;
  sourceLessonId?: string;
  sourceLessonNumber?: number | null;
};

let wordCatalogCache: WordCatalogItem[] | null = null;

export async function getVocabStreamReview(userId: string) {
  const weakWords = await readWeakWords(userId);
  const catalog = await loadWordCatalog();
  const catalogBySourceWord = new Map(
    catalog.map((item) => [makeSourceWordKey(item.sourceCategory, item.word), item]),
  );
  const hydratedWeakWords = weakWords.map((row) => {
    const catalogItem = catalogBySourceWord.get(makeSourceWordKey(row.source_category, row.word));
    return {
      word: row.word,
      definition: row.definition || catalogItem?.definition || "",
      example: row.example || catalogItem?.example || undefined,
      explanation: row.explanation || catalogItem?.explanation || undefined,
      japaneseMeaning: catalogItem?.japaneseMeaning || undefined,
      synonyms: catalogItem?.synonyms || undefined,
      antonyms: catalogItem?.antonyms || undefined,
      forms: catalogItem?.forms || undefined,
      sourceCategory: row.source_category,
      sourceLessonId: row.source_lesson_id || catalogItem?.sourceLessonId || undefined,
      sourceLessonNumber: row.source_lesson_number ?? catalogItem?.sourceLessonNumber ?? null,
      mistakeCount: Number(row.mistake_count) || 1,
      lastMistakenAt: row.last_mistaken_at,
    };
  });

  return {
    weakWords: hydratedWeakWords,
    questions: buildReviewQuestions(hydratedWeakWords, catalog),
  };
}

async function readWeakWords(userId: string) {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const params = new URLSearchParams({
    select: "word,definition,example,explanation,source_category,source_lesson_id,source_lesson_number,mistake_count,last_mistaken_at",
    user_id: `eq.${userId}`,
    order: "mistake_count.desc,last_mistaken_at.desc",
  });

  const response = await fetch(`${supabaseUrl}/rest/v1/vocabstream_user_mistakes?${params}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? `Supabase mistake lookup failed with status ${response.status}`);
  }

  return (await response.json()) as VocabStreamWeakWordRow[];
}

async function loadWordCatalog() {
  if (wordCatalogCache) return wordCatalogCache;

  const root = path.join(process.cwd(), "public", "vocabstream", "data");
  const categories = await fs.readdir(root, { withFileTypes: true });
  const catalog: WordCatalogItem[] = [];

  for (const category of categories) {
    if (!category.isDirectory()) continue;
    const categoryPath = path.join(root, category.name);
    const files = await fs.readdir(categoryPath);
    for (const file of files) {
      if (!/^Lesson\d+\.json$/i.test(file)) continue;
      const lessonNumber = parseInt(file.match(/\d+/)?.[0] ?? "", 10);
      const raw = await fs.readFile(path.join(categoryPath, file), "utf8");
      const json = JSON.parse(raw) as { lesson_id?: string; words?: LessonWord[] };
      const words = Array.isArray(json.words) ? json.words : [];
      for (const word of words) {
        if (!word.word) continue;
        catalog.push({
          word: word.word,
          definition: word.meaning || word.japaneseMeaning || "",
          japaneseMeaning: word.japaneseMeaning || undefined,
          example: word.example || undefined,
          explanation: word.explanation || undefined,
          synonyms: word.synonyms || undefined,
          antonyms: word.antonyms || undefined,
          forms: word.forms || undefined,
          sourceCategory: category.name,
          sourceLessonId: `${category.name}-lesson-${Number.isFinite(lessonNumber) ? lessonNumber : ""}`,
          sourceLessonNumber: Number.isFinite(lessonNumber) ? lessonNumber : null,
        });
      }
    }
  }

  wordCatalogCache = catalog;
  return catalog;
}

function buildReviewQuestions(weakWords: ReviewWord[], catalog: WordCatalogItem[]) {
  const usable = shuffle(weakWords.filter((word) => word.word && word.definition));
  const meaningWords = usable.slice(0, 20);
  const quizWords = shuffle(usable.filter((word) => word.example)).slice(0, 20);

  return shuffle([
    ...meaningWords.map((word, index) => buildMeaningQuestion(word, catalog, index)),
    ...quizWords.map((word, index) => buildQuizQuestion(word, catalog, index)),
  ].filter(Boolean) as ReviewQuestion[]);
}

function buildMeaningQuestion(word: ReviewWord, catalog: WordCatalogItem[], index: number): ReviewQuestion | null {
  const choices = buildChoices(word, catalog);
  if (choices.length < 2) return null;
  const correctAnswer = word.word;
  return {
    id: `meaning-${word.sourceCategory}-${word.word}-${index}`,
    questionType: "meaning",
    word: word.word,
    prompt: word.definition,
    choices,
    answerIndex: choices.indexOf(correctAnswer),
    correctAnswer,
    definition: word.definition,
    example: word.example,
    explanation: word.explanation,
    japaneseMeaning: word.japaneseMeaning,
    synonyms: word.synonyms,
    antonyms: word.antonyms,
    forms: word.forms,
    sourceCategory: word.sourceCategory,
    sourceLessonId: word.sourceLessonId,
    sourceLessonNumber: word.sourceLessonNumber,
  };
}

function buildQuizQuestion(word: ReviewWord, catalog: WordCatalogItem[], index: number): ReviewQuestion | null {
  const choices = buildChoices(word, catalog);
  if (choices.length < 2) return null;
  const correctAnswer = word.word;
  return {
    id: `quiz-${word.sourceCategory}-${word.word}-${index}`,
    questionType: "quiz",
    word: word.word,
    prompt: makeBlankSentence(word.example || "", word.word),
    choices,
    answerIndex: choices.indexOf(correctAnswer),
    correctAnswer,
    definition: word.definition,
    example: word.example,
    explanation: word.explanation || word.definition,
    japaneseMeaning: word.japaneseMeaning,
    synonyms: word.synonyms,
    antonyms: word.antonyms,
    forms: word.forms,
    sourceCategory: word.sourceCategory,
    sourceLessonId: word.sourceLessonId,
    sourceLessonNumber: word.sourceLessonNumber,
  };
}

function buildChoices(word: ReviewWord, catalog: WordCatalogItem[]) {
  const sameLessonWords = catalog
    .filter((item) => isSameSourceLesson(item, word) && item.word.toLowerCase() !== word.word.toLowerCase())
    .map((item) => item.word);
  const sameCategoryWords = catalog
    .filter((item) => item.sourceCategory === word.sourceCategory && item.word.toLowerCase() !== word.word.toLowerCase())
    .map((item) => item.word);
  const distractorPool = uniqueStrings([...shuffle(sameLessonWords), ...shuffle(sameCategoryWords)]);
  const uniqueDistractors = distractorPool.slice(0, 2);
  return shuffle([word.word, ...uniqueDistractors]);
}

function isSameSourceLesson(item: WordCatalogItem, word: ReviewWord) {
  if (item.sourceCategory !== word.sourceCategory) return false;
  if (word.sourceLessonNumber !== null && word.sourceLessonNumber !== undefined) {
    return item.sourceLessonNumber === word.sourceLessonNumber;
  }
  if (word.sourceLessonId) {
    return item.sourceLessonId === word.sourceLessonId;
  }
  return false;
}

function uniqueStrings(items: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

function makeBlankSentence(sentence: string, word: string) {
  if (!sentence) return "____";
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(escaped, "i");
  return re.test(sentence) ? sentence.replace(re, "____") : `____ ${sentence}`;
}

function shuffle<T>(items: T[]) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makeSourceWordKey(sourceCategory: string, word: string) {
  return `${sourceCategory.toLowerCase()}::${word.toLowerCase()}`;
}
