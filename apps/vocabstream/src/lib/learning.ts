import type { VocabStreamQuestionAttempt, VocabStreamReviewQuestion } from "../api";

export type { LessonWord, LessonData } from "./content.ts";
import type { LessonData } from "./content.ts";
import { buildWordQuestions, normalizeWord, shuffle } from "./questionPolicy.ts";
export type LearningAttempt = VocabStreamQuestionAttempt & { questionId: string };
export function makeLessonQuestions(lesson: LessonData, lessonId: string): VocabStreamReviewQuestion[] {
  const [category, number] = lessonId.split("-lesson-");
  const words = Array.from(new Map(lesson.words.filter((word) => word.word).map((word) => [normalizeWord(word.word), word])).values());
  const questions=words.flatMap(word=>buildWordQuestions(word,words,{category,lessonId,lessonNumber:Number(number)||null}));
  return [
    ...shuffle(questions.filter(question=>question.questionType==="meaning")),
    ...shuffle(questions.filter(question=>question.questionType==="quiz")),
  ];
}
export function createAttempt(question: VocabStreamReviewQuestion, choice: number, order: number, isReplay = false): LearningAttempt {
  return { questionId: question.id, questionType: question.questionType, word: question.word, prompt: question.prompt, correctAnswer: question.correctAnswer, selectedAnswer: question.choices[choice], isCorrect: choice === question.answerIndex, isReplay, attemptOrder: order, answeredAt: new Date().toISOString(), choices: question.choices, sourceCategory: question.sourceCategory, sourceLessonId: question.sourceLessonId, sourceLessonNumber: question.sourceLessonNumber, definition: question.definition, example: question.example, explanation: question.explanation, japaneseMeaning: question.japaneseMeaning, synonyms: question.synonyms, antonyms: question.antonyms, forms: question.forms };
}
export function summarizeAttempts(questions: VocabStreamReviewQuestion[], attempts: LearningAttempt[]) {
  const firstAttempts = new Map(attempts.filter((attempt) => !attempt.isReplay).map((attempt) => [attempt.questionId, attempt]));
  const meaning = questions.filter((question) => question.questionType === "meaning");
  const quiz = questions.filter((question) => question.questionType === "quiz");
  const meaningScore = meaning.filter((question) => firstAttempts.get(question.id)?.isCorrect).length;
  const quizScore = quiz.filter((question) => firstAttempts.get(question.id)?.isCorrect).length;
  const total = meaning.length + quiz.length;
  return { meaningScore, meaningTotal: meaning.length, quizScore, quizTotal: quiz.length, score: meaningScore + quizScore, total, percent: total ? Math.round((meaningScore + quizScore) / total * 100) : 0 };
}
export function anonymousUserId(): string | undefined {
  try { const key = "vocabstream_anonymous_user_id"; const existing = localStorage.getItem(key); if (existing) return existing; const id = crypto.randomUUID(); localStorage.setItem(key, id); return id; } catch { return undefined; }
}
