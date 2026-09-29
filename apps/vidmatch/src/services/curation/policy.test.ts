import assert from "node:assert/strict";
import test from "node:test";
import {
  checkDuration, durationPolicy, evaluateEditorialReview, normalizeYoutubeVideoId,
  selectDiverseCandidates, transcriptSignals,
  type DiversityCandidate, type EditorialReview,
} from "./policy.ts";

const videoId = "dQw4w9WgXcQ";
const now = new Date("2026-09-29T12:00:00Z");
function review(overrides: Partial<EditorialReview> = {}): EditorialReview {
  return {
    videoId, level: "B1", levelMin: "B1", levelMax: "B2", topics: ["environment"], format: "news report",
    evidence: {
      kind: "publisher_cefr",
      sourceUrl: "https://learnenglish.britishcouncil.org/free-resources/general/video-zone/whats-environmental-impact-ai",
      checkedAt: "2026-09-29", statement: "The exact embedded video has publisher suitability labels B1 and B2.",
      englishConfirmed: true, exactVideoMatch: true, coverage: "whole_video",
    },
    reviewer: "ProjectFluence editor", reviewedAt: "2026-09-29T10:00:00Z",
    learningValue: "strong", contentValue: "adequate", confidence: "high", ...overrides,
  };
}
function evaluate(input: unknown) { return evaluateEditorialReview(input, { now }); }
function codes(input: unknown) { return evaluate(input).reasons.map((reason) => reason.code); }
function evidence(overrides: Partial<EditorialReview["evidence"]>) { return { ...review().evidence, ...overrides }; }
function candidate(index: number, overrides: Partial<DiversityCandidate> = {}): DiversityCandidate {
  return {
    videoId: `item${String(index).padStart(7, "0")}`, level: "B1", channelId: `channel-${index}`,
    topics: ["science"], format: "explainer", qualityScore: 80, classificationConfidence: 0.9, ...overrides,
  };
}

test("publisher evidence preserves its range and produces only independent editorial scores", () => {
  const result = evaluate({ ...review(), videoId: `https://youtu.be/${videoId}`, views: 10_000_000, qualityScore: 100, transcript_available: true });
  assert.equal(result.decision, "approve");
  if (result.decision !== "approve") return;
  assert.equal(result.editorial.videoId, videoId);
  assert.equal(result.editorial.levelMin, "B1");
  assert.equal(result.editorial.levelMax, "B2");
  assert.equal(result.editorial.levelBasis, "suggested_starting_level");
  assert.equal(result.editorial.qualityScore, 80);
  assert.equal(result.editorial.classificationConfidence, 0.9);
  assert.equal(result.editorial.confidenceKind, "qualitative_rubric");
  assert.equal(result.editorial.audioReview, null);
  assert.equal(result.editorial.transcriptSignals, null);
  assert.equal("views" in result.editorial, false);
  assert.equal("transcript_available" in result.editorial, false);
});

test("levels and their ordered evidence range must be valid", () => {
  assert.ok(codes(review({ level: "A2" })).includes("invalid_level_range"));
  assert.ok(codes(review({ levelMin: "C1", levelMax: "B1" })).includes("invalid_level_range"));
  assert.ok(codes({ ...review(), level: "Intermediate" }).includes("invalid_level"));
  assert.equal(evaluate(review({ level: "B2" })).decision, "approve");
});

test("broad publisher ranges cannot manufacture a C2 starting level", () => {
  const broad = review({ level: "C2", levelMin: "B1", levelMax: "C2" });
  assert.equal(evaluate(broad).decision, "defer");
  assert.ok(codes(broad).includes("broad_publisher_range"));
  assert.equal(evaluate(review({ level: "C2", levelMin: "C1", levelMax: "C2" })).decision, "approve");
  assert.equal(evaluate(review({ level: "B1", levelMin: "B1", levelMax: "C2" })).decision, "approve");
});

test("publisher trust uses exact hosts and may be explicitly configured", () => {
  for (const host of ["learnenglish.britishcouncil.org.evil.example", "evil.example", "sub.eslbrains.com"]) {
    const input = review({ evidence: evidence({ sourceUrl: `https://${host}/lesson` }) });
    assert.equal(evaluate(input).decision, "defer");
    assert.ok(codes(input).includes("untrusted_publisher"));
  }
  for (const host of ["eslbrains.com", "app.fluentize.com", "www.linguahouse.com", "www.cambridgeenglish.org", "test-english.com"]) {
    assert.equal(evaluate(review({ evidence: evidence({ sourceUrl: `https://${host}/lesson` }) })).decision, "approve");
  }
  const input = review({ evidence: evidence({ sourceUrl: "https://partner.example/lesson" }) });
  assert.equal(evaluateEditorialReview(input, { now, trustedPublisherHosts: ["partner.example"] }).decision, "approve");
  assert.equal(evaluateEditorialReview(review(), { now, trustedPublisherHosts: [] }).decision, "defer");
});

test("English, exact-video matching, and full-video evidence must be established", () => {
  for (const [changes, code] of [
    [{ englishConfirmed: false }, "english_unconfirmed"],
    [{ exactVideoMatch: false }, "video_match_unconfirmed"],
    [{ coverage: "excerpt" }, "excerpt_only_evidence"],
  ] as const) {
    const input = review({ evidence: evidence(changes) });
    assert.equal(evaluate(input).decision, "defer");
    assert.ok(codes(input).includes(code));
  }
  assert.ok(codes({ ...review(), evidence: { ...evidence({}), englishConfirmed: "true" } }).includes("invalid_evidence_flags"));
});

test("low-confidence beginner evidence is deferred, with explicit ordinal confidence mapping", () => {
  for (const level of ["A1", "A2"] as const) {
    const input = review({ level, levelMin: "A1", levelMax: "A2", confidence: "low" });
    assert.equal(evaluate(input).decision, "defer");
    assert.ok(codes(input).includes("beginner_confidence_low"));
    assert.equal(evaluate({ ...input, confidence: "medium" }).decision, "approve");
  }
  for (const [confidence, value] of [["high", 0.9], ["medium", 0.7], ["low", 0.4]] as const) {
    const result = evaluate(review({ confidence }));
    assert.equal(result.decision, "approve");
    if (result.decision === "approve") assert.equal(result.editorial.classificationConfidence, value);
  }
});

test("weak content or learning value rejects even when other evidence is strong", () => {
  for (const input of [review({ learningValue: "weak" }), review({ contentValue: "weak" })]) {
    assert.equal(evaluate(input).decision, "reject");
    assert.ok(codes(input).includes("insufficient_editorial_value"));
  }
  const result = evaluate(review({ learningValue: "adequate", contentValue: "adequate" }));
  assert.equal(result.decision, "approve");
  if (result.decision === "approve") assert.equal(result.editorial.qualityScore, 70);
});

test("unseen audio stays unknown and audio claims require real listening coverage", () => {
  for (const audioReview of [{ intelligible: true }, { intelligible: true, observedSeconds: 0 }, { intelligible: true, observedSeconds: NaN }]) {
    assert.ok(codes({ ...review(), audioReview }).includes("invalid_audio_review"));
  }
  const result = evaluate(review({ audioReview: { intelligible: true, observedSeconds: 70, backgroundNoise: "minimal", overlappingSpeech: false } }));
  assert.equal(result.decision, "approve");
  if (result.decision === "approve") {
    assert.equal(result.editorial.audioReview?.observedSeconds, 70);
    assert.equal(result.editorial.qualityScore, 80);
  }
});

test("unintelligible audio cannot be rescued by publisher labels or popularity", () => {
  for (const audioReview of [
    { intelligible: false, observedSeconds: 120 },
    { intelligible: true, observedSeconds: 120, backgroundNoise: "obscures_speech" as const },
  ]) {
    const input = review({ audioReview });
    assert.equal(evaluate(input).decision, "reject");
    assert.ok(codes(input).includes("unintelligible_audio"));
  }
});

test("transcript evidence requires authorized text and never exposes raw transcript in output", () => {
  const input = review({ evidence: evidence({ kind: "authorized_transcript", sourceUrl: "https://partner.example/transcript" }) });
  assert.equal(evaluate(input).decision, "defer");
  assert.ok(codes(input).includes("authorized_transcript_missing"));
  const result = evaluate({ ...input, evidence: { ...input.evidence, rightsBasis: "Owner license PF-42" }, transcript: { text: "Hello there. Here is the licensed transcript.", rightsBasis: "Owner license PF-42" } });
  assert.equal(result.decision, "approve");
  if (result.decision === "approve") {
    assert.equal(result.editorial.transcriptSignals?.supplementaryOnly, true);
    assert.equal("transcript" in result.editorial, false);
    assert.equal(result.editorial.audioReview, null);
  }
  assert.ok(codes({ ...input, transcript: { text: "Some text", rightsBasis: "" } }).includes("invalid_transcript"));
});

test("lexical observations remain supplementary and never determine level or speaking speed", () => {
  const text = "Photosynthesis and superconductivity. Epistemological differentiation!";
  const signals = transcriptSignals(text);
  assert.equal(signals.wordCount, 5);
  assert.equal(signals.approximateSentenceCount, 2);
  assert.equal(signals.longWordFraction, 0.8);
  assert.equal(signals.meanWordsPerSentence, 2.5);
  assert.equal("level" in signals, false);
  assert.equal("speechRate" in signals, false);
  assert.equal(transcriptSignals("... 123").wordCount, 0);
  const result = evaluate(review({ level: "A1", levelMin: "A1", levelMax: "A2", transcript: { text, rightsBasis: "Owner permission" } }));
  assert.equal(result.decision, "approve");
  if (result.decision === "approve") assert.equal(result.editorial.level, "A1");
});

test("malformed unknown inputs fail closed without coercing evidence values", () => {
  for (const input of [null, undefined, "review", [], 7, {}, { ...review(), evidence: null }, { ...review(), evidence: { ...evidence({}), kind: Object.create(null) } }]) {
    assert.equal(evaluate(input).decision, "reject");
  }
  for (const sourceUrl of ["javascript:alert(1)", "http://eslbrains.com/lesson", "https://secret@eslbrains.com/lesson", "https://eslbrains.com:9443/lesson", "https://eslbrains.com/\nlesson"]) {
    assert.ok(codes(review({ evidence: evidence({ sourceUrl }) })).includes("invalid_evidence_url"));
  }
});

test("review dates reject calendar errors, absent time zones and future checks", () => {
  for (const reviewedAt of ["yesterday", "2026-02-30", "2026-09-29T10:00:00", "2027-01-01", "2026-13-01"]) {
    assert.ok(codes(review({ reviewedAt })).includes("invalid_review_date"));
  }
  assert.equal(evaluate(review({ reviewedAt: "2026-09-29T19:00:00+09:00" })).decision, "approve");
  assert.equal(evaluate(review({ reviewedAt: "2026-09-29T10:00:00.123456Z" })).decision, "approve");
  assert.ok(codes(review({ evidence: evidence({ checkedAt: "2027-01-01" }) })).includes("invalid_evidence_date"));
});

test("unbounded content and unsupported topics cannot enter the editorial catalog", () => {
  for (const input of [
    review({ format: "x".repeat(81) }), review({ reviewer: "" }),
    review({ topics: ["unknown-topic"] }), review({ topics: [] }),
    review({ topics: Array(6).fill("science") }),
    review({ evidence: evidence({ statement: "x".repeat(4001) }) }),
    review({ transcript: { text: "x".repeat(100_001), rightsBasis: "Owner permission" } }),
  ]) assert.equal(evaluate(input).decision, "reject");
  const result = evaluate(review({ topics: ["Cooking", "food", "wildlife"], format: "  Interview  " }));
  assert.equal(result.decision, "approve");
  if (result.decision === "approve") {
    assert.deepEqual(result.editorial.topics, ["food", "nature"]);
    assert.equal(result.editorial.format, "interview");
  }
});

test("supported public, mobile, short, embed and privacy URLs normalize to the same ID", () => {
  for (const input of [
    videoId, ` ${videoId} `, `https://www.youtube.com/watch?v=${videoId}&t=20`,
    `https://youtube.com/watch?feature=shared&v=${videoId}`, `youtube.com/watch?v=${videoId}`,
    `https://m.youtube.com/watch?v=${videoId}`, `http://www.youtube.com/watch?v=${videoId}`,
    `https://youtu.be/${videoId}?si=example`, `youtu.be/${videoId}`,
    `https://www.youtube.com/shorts/${videoId}`, `https://youtube.com/embed/${videoId}?start=10`,
    `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`,
  ]) assert.equal(normalizeYoutubeVideoId(input), videoId, input);
});

test("URL normalization rejects lookalikes, ambiguous IDs, credentials and redirect paths", () => {
  for (const input of [
    null, 123, "short", "javascript:alert(1)", `https://youtube.com.evil.example/watch?v=${videoId}`,
    `https://youtu.be.evil.example/${videoId}`, `https://youtube.com@evil.example/watch?v=${videoId}`,
    `https://user@youtube.com/watch?v=${videoId}`, `https://youtube.com:9443/watch?v=${videoId}`,
    `https://youtube.com/redirect?q=https://youtu.be/${videoId}`, `https://youtube.com/watch?v=${videoId}&v=${videoId}`,
    `https://youtube.com/watch?v=${videoId}%0a`, `https://youtu.be/${videoId}/extra`,
    `https://www.youtube-nocookie.com/watch?v=${videoId}`, `https://evil.example/?url=https://youtu.be/${videoId}`,
    `https://youtube.com\\@evil.example/watch?v=${videoId}`, `https://youtube.com/watch?v=${videoId}\n&extra=1`,
  ]) assert.equal(normalizeYoutubeVideoId(input), null, String(input));
});

test("duration is an inclusive level-specific eligibility gate", () => {
  for (const level of ["A1", "A2"] as const) assert.deepEqual(durationPolicy(level), { minSeconds: 60, maxSeconds: 900 });
  for (const level of ["B1", "B2"] as const) assert.deepEqual(durationPolicy(level), { minSeconds: 120, maxSeconds: 1500 });
  for (const level of ["C1", "C2"] as const) assert.deepEqual(durationPolicy(level), { minSeconds: 120, maxSeconds: 2700 });
  assert.equal(checkDuration("A1", 60), true);
  assert.equal(checkDuration("A1", 900), true);
  for (const value of [59, 901, 0, NaN, Infinity, "60", null]) assert.equal(checkDuration("A1", value), false);
});

test("duration overrides are explicit and invalid bounds fail closed", () => {
  assert.deepEqual(durationPolicy("A1", { A1: { maxSeconds: 600 } }), { minSeconds: 60, maxSeconds: 600 });
  assert.equal(checkDuration("A1", 601, { A1: { maxSeconds: 600 } }), false);
  for (const bounds of [{ minSeconds: 0 }, { maxSeconds: 30 }, { maxSeconds: Infinity }, { minSeconds: 1.5 }]) {
    assert.throws(() => durationPolicy("A1", { A1: bounds }), TypeError);
  }
  assert.throws(() => durationPolicy("D1" as "A1"), TypeError);
});

test("existing catalog counts enforce target and channel cap across repeated imports", () => {
  const existing = Array.from({ length: 5 }, (_, index) => candidate(index, { channelId: "already-full" }));
  const incoming = [candidate(0), candidate(6, { channelId: "already-full" }), candidate(7, { channelId: "new-channel" }), candidate(8, { channelId: "new-channel" })];
  const result = selectDiverseCandidates(incoming, { existing, targetPerLevel: 6 });
  assert.deepEqual(result.map((row) => row.videoId), [candidate(7).videoId]);
  assert.deepEqual(selectDiverseCandidates(incoming, { existing: [...existing, ...result], targetPerLevel: 6 }), []);
  assert.equal(selectDiverseCandidates(incoming, { existing: [...existing, existing[0]], targetPerLevel: 6 }).length, 1);
});

test("default diversity cap permits at most five entries per level and channel", () => {
  const incoming = Array.from({ length: 36 }, (_, index) => candidate(index, { channelId: `channel-${index % 6}` }));
  const result = selectDiverseCandidates(incoming);
  assert.equal(result.length, 25);
  const counts = new Map<string, number>();
  for (const row of result) counts.set(row.channelId, (counts.get(row.channelId) ?? 0) + 1);
  assert.ok([...counts.values()].every((count) => count <= 5));
  assert.equal(counts.size, 6);
  assert.equal(selectDiverseCandidates(incoming.filter((row) => row.channelId === "channel-0")).length, 5);
});

test("diversity handles each level independently and leaves an honest shortage", () => {
  const incoming = [candidate(1, { level: "A1", channelId: "shared" }), candidate(2, { level: "A1", channelId: "shared" }), candidate(3, { level: "C2", channelId: "shared" })];
  const result = selectDiverseCandidates(incoming, { maxPerLevelChannel: 1 });
  assert.deepEqual(result.map((row) => row.level), ["A1", "C2"]);
  assert.deepEqual(selectDiverseCandidates(incoming, { targetPerLevel: 0 }), []);
});

test("underrepresented topics and formats take turns before editorial tie breakers", () => {
  const existing = [candidate(1, { channelId: "old", topics: ["science"], format: "explainer" })];
  const familiar = candidate(2, { qualityScore: 90 });
  const newTopic = candidate(3, { topics: ["culture"], qualityScore: 70 });
  assert.equal(selectDiverseCandidates([familiar, newTopic], { existing, targetPerLevel: 2 })[0].videoId, newTopic.videoId);
  const newFormat = candidate(4, { format: "interview", qualityScore: 70 });
  assert.equal(selectDiverseCandidates([familiar, newFormat], { existing, targetPerLevel: 2 })[0].videoId, newFormat.videoId);
  const better = candidate(5, { qualityScore: 90 });
  assert.equal(selectDiverseCandidates([familiar, better], { targetPerLevel: 1 })[0].videoId, familiar.videoId);
});

test("selection is stable, does not mutate inputs, deduplicates and ignores invalid candidates", () => {
  const incoming = [candidate(3), candidate(2), candidate(1)];
  const copy = structuredClone(incoming);
  const options = { targetPerLevel: 2 };
  assert.deepEqual(selectDiverseCandidates(incoming, options), selectDiverseCandidates([...incoming].reverse(), options));
  assert.deepEqual(incoming, copy);
  const invalid = [candidate(4, { qualityScore: NaN }), candidate(5, { channelId: "" }), candidate(6, { classificationConfidence: 7 }), candidate(7, { videoId: "bad" })];
  assert.equal(selectDiverseCandidates([incoming[0], incoming[0], ...invalid]).length, 1);
  assert.throws(() => selectDiverseCandidates(incoming, { targetPerLevel: -1 }), TypeError);
  assert.throws(() => selectDiverseCandidates(incoming, { maxPerLevelChannel: 0 }), TypeError);
});
