import assert from "node:assert/strict";
import { test } from "node:test";
import { boundedConversationHistory, makePromptMemory } from "./promptMemory.ts";

test("prompt context omits duplicated database data and bounds growing history", () => {
  const huge = "private-extra-field".repeat(10000);
  const result = makePromptMemory({ recentSummaries: Array.from({ length: 20 }, () => ({
    user_id: "user-id-not-for-prompt", mistakes: huge,
    summary: { title: "Recent lesson", recommendations: ["Practice past tense"], covered: [huge], weaknesses: [huge], mistakes: huge },
  })), mistakePatterns: [{ mistake_type: "grammar", pattern: "past tense", latest_correction: "I went", count: 3 }], unknownField: huge });
  assert.equal(result?.recentSummaries.length, 2);
  assert.ok(JSON.stringify(result).length < 18000);
  assert.ok(!JSON.stringify(result).includes("user-id-not-for-prompt"));
  assert.deepEqual(result?.mistakePatterns[0], { type: "grammar", pattern: "past tense", correction: "I went", count: 3 });
});

test("missing memory remains optional", () => { assert.equal(makePromptMemory(null), null); });


test("long multilingual summaries retain recent turns within the request byte budget", () => {
  const history = Array.from({ length: 100 }, (_, i) => ({ role: "user" as const, content: `${i}:` + "語".repeat(6000) }));
  const result = boundedConversationHistory(history);
  assert.ok(new TextEncoder().encode(JSON.stringify(result)).length < 80000);
  assert.ok(result.at(-1)?.content.startsWith("99:"));
  assert.ok(result.length > 1);
});


test("multilingual prompt memory respects the UTF-8 transport budget", () => {
  const long = "語".repeat(1000);
  const result = makePromptMemory({
    recentSummaries: Array.from({ length: 2 }, () => ({ summary: { title: long, covered: [long, long, long, long], weaknesses: [long, long, long, long], recommendations: [long, long, long, long] } })),
    mistakePatterns: Array.from({ length: 8 }, () => ({ pattern: long, latest_correction: long })),
    weakVocabItems: Array.from({ length: 8 }, () => ({ word: long, correct_answer: long })),
  });
  assert.ok(new TextEncoder().encode(JSON.stringify(result)).length <= 18000);
});
