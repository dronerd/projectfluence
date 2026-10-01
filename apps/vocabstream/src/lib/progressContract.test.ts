import assert from "node:assert/strict";
import test from "node:test";
import { parseVocabStreamProgress, ProgressValidationError } from "./progressContract.ts";
const answer = { questionType: "meaning", word: "hello", correctAnswer: "hello", selectedAnswer: "bye", isCorrect: false, attemptOrder: 1, choices: ["hello", "bye"] };
const payload = { attemptId: "00000000-0000-4000-8000-000000000001", lessonId: "word-beginner-lesson-1", genre: "word-beginner", wordCount: 2, meaningScore: 0, meaningTotal: 1, quizScore: 0, quizTotal: 0, questionAttempts: [answer] };
test("valid progress preserves stable id and strips spoofed owner fields", () => {
  const result = parseVocabStreamProgress({ ...payload, userId: "other", userEmail: "private@example.test" });
  assert.equal(result.attemptId, payload.attemptId);
  assert.equal("userId" in result, false);
  assert.equal("userEmail" in result, false);
});
test("rejects missing ids, empty/excessive arrays, nested arrays and malformed JSON objects", () => {
  for (const input of [null, [], { ...payload, attemptId: undefined }, { ...payload, questionAttempts: [] }, { ...payload, questionAttempts: Array(501).fill(answer) }, { ...payload, questionAttempts: [[]] }]) {
    assert.throws(() => parseVocabStreamProgress(input), ProgressValidationError);
  }
});
test("rejects coerced or impossible scores", () => {
  for (const patch of [{ meaningScore: 2 }, { quizTotal: "1" }, { meaningTotal: -1 }, { wordCount: Infinity }, { wordCount: 0.5 }, { replayCorrect: 2, replayTotal: 1 }, { replayCompleted: "false" }]) {
    assert.throws(() => parseVocabStreamProgress({ ...payload, ...patch }), ProgressValidationError);
  }
});
test("rejects dishonest correctness, answers outside choices, duplicated orders and invalid dates", () => {
  for (const patch of [{ isCorrect: true }, { selectedAnswer: "unknown" }, { choices: ["bye"] }, { answeredAt: "not a timestamp" }, { isReplay: "false" }]) {
    assert.throws(() => parseVocabStreamProgress({ ...payload, questionAttempts: [{ ...answer, ...patch }] }), ProgressValidationError);
  }
  assert.throws(() => parseVocabStreamProgress({ ...payload, questionAttempts: [answer, answer] }), ProgressValidationError);
});
test("replay-only batches retain first-pass totals without inferring scores from a partial batch", () => {
  const result = parseVocabStreamProgress({ ...payload, meaningScore: 7, meaningTotal: 10, replayCompleted: true, replayCorrect: 1, replayTotal: 1, questionAttempts: [{ ...answer, selectedAnswer: "hello", isCorrect: true, isReplay: true, attemptOrder: 11 }] });
  assert.equal(result.meaningScore, 7);
  assert.equal(result.replayCorrect, 1);
});
test("rejects case, Unicode-width and whitespace duplicate choices without changing stable IDs", () => {
  for (const choices of [["hello", "bye", "HELLO"], ["hello", "bye", "ｈｅｌｌｏ"], ["hello", "bye", " bye "]]) {
    assert.throws(() => parseVocabStreamProgress({ ...payload, questionAttempts: [{ ...answer, choices }] }), ProgressValidationError);
  }
  const compound={...answer,word:"take off",correctAnswer:"take off",selectedAnswer:"put on",choices:["take off","put on","take  off"]};
  assert.throws(() => parseVocabStreamProgress({ ...payload, questionAttempts: [compound] }), ProgressValidationError);
  assert.equal(parseVocabStreamProgress(payload).attemptId,payload.attemptId);
});
