import assert from "node:assert/strict";
import test from "node:test";
import { evidenceSummary, groundedObservations, rankEvidence, terms, type EvidenceRecord, type SessionMessage } from "./learningPolicy.ts";
const now = new Date("2026-10-01T00:00:00Z");
const row = (id: string, text: string, at: string, extra: Partial<EvidenceRecord> = {}): EvidenceRecord => ({ id, text, at, kind: "lesson_summary", confidence: 0.8, ...extra });
test("an older task-relevant weakness outranks many recent unrelated records", () => {
  const history = Array.from({ length: 200 }, (_, i) => row(`recent-${i}`, "Cooking recipes and shopping", "2026-09-30T00:00:00Z"));
  history.push(row("older", "Past tense narrative sequence", "2026-05-01T00:00:00Z"));
  assert.equal(rankEvidence(history, "past tense", now, 3)[0].id, "older");
});
test("later unaided success reduces unresolved difficulty without deleting evidence", () => {
  const unresolved = row("open", "distinguish affect effect", "2026-09-20T00:00:00Z", { failures: 5, successes: 0 });
  const recovered = { ...unresolved, id: "recovered", successes: 10 };
  assert.ok(rankEvidence([unresolved], "affect effect", now)[0].score > rankEvidence([recovered], "affect effect", now)[0].score);
  assert.ok(rankEvidence([recovered], "affect effect", now)[0].reasons.some(reason => reason.includes("reduces")));
});
test("future evidence is excluded before historical ranking", () => {
  assert.deepEqual(rankEvidence([row("future", "past tense", "2026-10-02T00:00:00Z")], "past tense", now), []);
});
test("near-identical summaries do not crowd out diverse history", () => {
  assert.equal(rankEvidence([row("1", "Past tense", "2026-09-01"), row("2", "past   tense", "2026-09-02")], "past tense", now).length, 1);
});
test("sparse and missing performance are not labelled mistakes", () => {
  const summary = evidenceSummary({ id: "session" }, [], [], false);
  assert.equal(summary.status, "provisional"); assert.deepEqual(summary.mistakes, []); assert.deepEqual(summary.strengths, []);
});
test("open/reveal events do not create mastered vocabulary or completed comprehension", () => {
  const summary = evidenceSummary({ id: "session" }, [], [{ id: "event", event_type: "vocabulary_revealed", payload: { word: "garden" }, created_at: now.toISOString() }], true);
  assert.deepEqual(summary.usefulVocabulary, []); assert.deepEqual(summary.strengths, []); assert.deepEqual(summary.activities, []);
});
test("hints remain attempts but cannot become unaided strength", () => {
  const summary = evidenceSummary({ id: "session" }, [], [{ id: "a", event_type: "vocabulary_attempt", payload: { word: "garden", correct: true, hintUsed: true }, created_at: now.toISOString() }], true);
  assert.deepEqual(summary.usefulVocabulary, ["garden"]); assert.deepEqual(summary.strengths, []);
});
const observations = [{ type: "grammar", original: "I go yesterday", correction: "I went yesterday", explanation: "Use the past tense for yesterday.", evidenceMessageId: "u", confidence: 1 }];
const messages: SessionMessage[] = [{ id: "u", role: "user", content: "I go yesterday to the park.", created_at: "2026-09-30T00:00:00Z" }, { id: "a", role: "assistant", content: "Try the past tense.", metadata: { observations }, created_at: "2026-09-30T00:00:01Z" }];
test("conversation suggestions carry real learner references and capped inferred confidence", () => {
  const [item] = groundedObservations(messages); assert.equal(item.confidence, 0.6); assert.equal(item.origin, "model_inferred"); assert.deepEqual(item.evidenceIds, ["u", "a"]);
});
test("fabricated observations and quoted examples are rejected", () => {
  assert.deepEqual(groundedObservations([{ ...messages[0], content: "I went yesterday." }, messages[1]]), []);
  assert.deepEqual(groundedObservations([{ ...messages[0], content: 'The example says "I go yesterday".' }, messages[1]]), []);
});
test("speech transcripts and prior assistant text are not learner mistakes", () => {
  assert.deepEqual(groundedObservations([{ ...messages[0], metadata: { inputMethod: "speech" } }, messages[1]]), []);
  assert.deepEqual(groundedObservations([{ id: "prior", role: "assistant", content: "Example: I go yesterday", created_at: "2026-09-29T00:00:00Z" }, ...messages]), []);
});
test("scored mistakes retain selected and correct answers with event evidence", () => {
  const summary = evidenceSummary({ id: "session" }, messages, [{ id: "try", event_type: "vocabulary_attempt", payload: { word: "garden", answer: "office", correctAnswer: "garden", correct: false }, created_at: now.toISOString() }], true);
  assert.equal(summary.mistakes[0].original, "office"); assert.deepEqual(summary.mistakes[0].evidenceIds, ["try"]); assert.ok(summary.uncertainty.length);
});
test("multilingual lexical terms have a bounded budget", () => {
  assert.ok(terms("練習 apprendre pasado الماضي").length >= 4); assert.ok(terms(Array.from({ length: 100 }, (_, i) => `term${i}`).join(" ")).length <= 24);
});
