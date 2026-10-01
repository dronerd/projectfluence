import assert from "node:assert/strict";
import test from "node:test";
import { createAttempt, makeLessonQuestions, summarizeAttempts, type LessonData } from "./learning.ts";

const lesson: LessonData = { words: [
  { word: "apple", meaning: "a round fruit", example: "I ate an apple.", sentencePractice: {prompt:"The round red fruit is an ____.",distractors:["banana","carrot"],reviewNote:"Only apple matches the round red fruit clue."} },
  { word: "banana", meaning: "a long fruit", example: "The banana is yellow.", sentencePractice: {prompt:"The long yellow fruit is a ____.",distractors:["apple","carrot"],reviewNote:"Only banana matches both the shape and color clues."} },
  { word: "carrot", meaning: "an orange vegetable", example: "I ate a carrot.", sentencePractice: {prompt:"The orange root vegetable is a ____.",distractors:["apple","banana"],reviewNote:"Only carrot is a root vegetable."} },
] };

test("a perfect lesson counts the final answer once and stays at 100 percent", () => {
  const questions = makeLessonQuestions(lesson, "word-beginner-lesson-1");
  const attempts = questions.map((question, index) => createAttempt(question, question.answerIndex, index + 1));
  const summary = summarizeAttempts(questions, attempts);
  assert.equal(summary.quizScore, 3);
  assert.equal(summary.meaningScore, 3);
  assert.equal(summary.total, 6);
  assert.equal(summary.percent, 100);
  assert.equal(summarizeAttempts(questions, [...attempts, attempts.at(-1)!]).percent, 100);
});

test("a successful replay retains the initial score", () => {
  const questions = makeLessonQuestions(lesson, "word-beginner-lesson-1");
  const attempts = questions.map((question, index) => createAttempt(question, index === 0 ? (question.answerIndex + 1) % question.choices.length : question.answerIndex, index + 1));
  const initial = summarizeAttempts(questions, attempts);
  const replay = createAttempt(questions[0], questions[0].answerIndex, 7, true);
  assert.equal(initial.score, 5);
  assert.deepEqual(summarizeAttempts(questions, [...attempts, replay]), initial);
});

test("duplicate words do not inflate the number of scored questions", () => {
  const questions = makeLessonQuestions({ words: [...lesson.words, { ...lesson.words[0], word: "Apple" }] }, "word-beginner-lesson-1");
  assert.equal(questions.length, 6);
  assert.equal(new Set(questions.map((question) => question.id)).size, 6);
  const attempts = questions.map((question, index) => createAttempt(question, question.answerIndex, index + 1));
  assert.equal(summarizeAttempts(questions, attempts).percent, 100);
});

test("missing or unsuitable examples are not turned into misleading sentence questions", () => {
  const questions = makeLessonQuestions({ words: [lesson.words[0], { word: "banana", meaning: "a yellow fruit", example: "I eat fruit." }, { word: "carrot", meaning: "a vegetable" }] }, "word-beginner-lesson-1");
  assert.equal(questions.filter((question) => question.questionType === "quiz").length, 1);
  assert.equal(questions.filter((question) => question.questionType === "meaning").length, 3);
  assert.match(questions.find((question) => question.questionType === "quiz")!.prompt, /____/);
});

test("study examples never become scored gaps without explicit reviewed practice", () => {
  const words=lesson.words.map(word=>({...word,sentencePractice:undefined}));
  const questions=makeLessonQuestions({words},"word-beginner-lesson-1");
  assert.equal(questions.length,3);assert.ok(questions.every(question=>question.questionType==="meaning"));
  assert.equal(summarizeAttempts(questions,[]).quizTotal,0);
});
