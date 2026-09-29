import type { VocabStreamQuestionAttempt, VocabStreamReviewQuestion } from "../api";

export type LessonWord = { word: string; meaning?: string; japaneseMeaning?: string; example?: string; explanation?: string; synonyms?: string; antonyms?: string; forms?: string };
export type LessonData = { title?: string; paragraph?: string; words: LessonWord[] };
export type LearningAttempt = VocabStreamQuestionAttempt & { questionId: string };
function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function makeLessonQuestions(lesson: LessonData, lessonId: string): VocabStreamReviewQuestion[] {
  const [category, number] = lessonId.split("-lesson-");
  const words = Array.from(new Map(lesson.words.filter((word) => word.word).map((word) => [word.word.toLowerCase(), word])).values());
  const make = (word: LessonWord, type: "meaning" | "quiz"): VocabStreamReviewQuestion => {
    const choices = shuffle([word.word, ...shuffle(words.filter((item) => item.word.toLowerCase() !== word.word.toLowerCase())).slice(0, 2).map((item) => item.word)]);
    const escaped = word.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const sentence = word.example ?? "";
    return { id: `${type}-${word.word.toLowerCase()}`, questionType: type, word: word.word, prompt: type === "meaning" ? word.meaning || word.japaneseMeaning || "" : sentence.replace(new RegExp(escaped, "i"), "____"), choices, answerIndex: choices.indexOf(word.word), correctAnswer: word.word, definition: word.meaning || word.japaneseMeaning || "", japaneseMeaning: word.japaneseMeaning, example: word.example, explanation: word.explanation, synonyms: word.synonyms, antonyms: word.antonyms, forms: word.forms, sourceCategory: category, sourceLessonId: lessonId, sourceLessonNumber: Number(number) || null };
  };
  if (words.length < 2) return [];
  return [
    ...shuffle(words.filter((word) => word.meaning || word.japaneseMeaning).map((word) => make(word, "meaning"))),
    ...shuffle(words.filter((word) => word.example && word.example.toLowerCase().includes(word.word.toLowerCase())).map((word) => make(word, "quiz"))),
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
