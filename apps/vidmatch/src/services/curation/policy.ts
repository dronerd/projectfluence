import { LEVELS, isYoutubeVideoId, type VidMatchLevel } from "../videoContract.ts";
import { normalizeTopics, TOPICS } from "../videoTaxonomy.ts";

export type EvidenceKind = "publisher_cefr" | "human_review" | "authorized_transcript";
export type EditorialValue = "strong" | "adequate" | "weak";
export type EditorialConfidence = "high" | "medium" | "low";
export type AudioReview = {
  intelligible: boolean;
  /** Actual listening coverage, not video duration obtained from an API. */
  observedSeconds: number;
  backgroundNoise?: "minimal" | "noticeable" | "obscures_speech";
  overlappingSpeech?: boolean;
  notes?: string;
};
export type EditorialReview = {
  videoId: string;
  /** Suggested starting level for the task, not an intrinsic property of a video. */
  level: VidMatchLevel;
  levelMin: VidMatchLevel;
  levelMax: VidMatchLevel;
  topics: string[];
  format: string;
  evidence: {
    kind: EvidenceKind;
    sourceUrl: string;
    checkedAt: string;
    statement: string;
    englishConfirmed: boolean;
    exactVideoMatch: boolean;
    rightsBasis?: string;
    coverage?: "whole_video" | "excerpt";
  };
  reviewer: string;
  reviewedAt: string;
  learningValue: EditorialValue;
  contentValue: EditorialValue;
  confidence: EditorialConfidence;
  audioReview?: AudioReview;
  transcript?: { text: string; rightsBasis: string };
};

export type TranscriptSignals = {
  method: "orthographic_heuristics_v1";
  supplementaryOnly: true;
  wordCount: number;
  uniqueWordFraction: number;
  longWordFraction: number;
  approximateSentenceCount: number;
  meanWordsPerSentence: number;
};
export type ApprovedEditorial = Omit<EditorialReview, "transcript" | "audioReview"> & {
  levelBasis: "suggested_starting_level";
  qualityScore: number;
  classificationConfidence: number;
  confidenceKind: "qualitative_rubric";
  audioReview: AudioReview | null;
  transcriptSignals: TranscriptSignals | null;
};
export type PolicyReason = { code: string; message: string };
export type EditorialDecision =
  | { decision: "approve"; reasons: PolicyReason[]; editorial: ApprovedEditorial }
  | { decision: "defer" | "reject"; reasons: PolicyReason[]; editorial: null };
export type EditorialPolicyOptions = {
  now?: Date;
  /** Exact hostnames; additions require an editorial trust decision. No suffix matching. */
  trustedPublisherHosts?: readonly string[];
};

export const TRUSTED_PUBLISHER_HOSTS = [
  "learnenglish.britishcouncil.org", "learnenglishteens.britishcouncil.org",
  "cambridgeenglish.org", "www.cambridgeenglish.org",
  "eslbrains.com", "app.fluentize.com", "linguahouse.com", "www.linguahouse.com",
  "test-english.com", "www.test-english.com",
] as const;

/** Ordinal editorial confidence, not a calibrated probability of CEFR correctness. */
export const CONFIDENCE_VALUES: Record<EditorialConfidence, number> = { high: 0.9, medium: 0.7, low: 0.4 };
const VALUE_POINTS: Record<EditorialValue, number> = { strong: 90, adequate: 70, weak: 30 };
const MAX_TRANSCRIPT_CHARACTERS = 100_000;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function boundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}
function isLevel(value: unknown): value is VidMatchLevel {
  return typeof value === "string" && LEVELS.some((level) => level === value);
}
function isValue(value: unknown): value is EditorialValue {
  return value === "strong" || value === "adequate" || value === "weak";
}
function isConfidence(value: unknown): value is EditorialConfidence {
  return value === "high" || value === "medium" || value === "low";
}
function httpsUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 2048 || /[\s\\]/u.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port ? url : null;
  } catch { return null; }
}
function validDate(value: unknown, now: Date): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/u.test(value)) return false;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const timestamp = Date.parse(value);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    && Number.isFinite(timestamp) && timestamp <= now.getTime() + 5 * 60_000;
}

/** Accept known YouTube URL forms; never follow redirects or accept lookalike hosts. */
export function normalizeYoutubeVideoId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (/^[A-Za-z0-9_-]{11}$/u.test(input)) return input;
  if (input.length > 2048 || /[\s\\]/u.test(input)) return null;
  let url: URL;
  try {
    // Pasted links may omit their scheme. Only a recognized host receives HTTPS.
    const withScheme = /^(?:(?:www\.|m\.)?youtube\.com|youtu\.be|(?:www\.)?youtube-nocookie\.com)\//u.test(input) ? `https://${input}` : input;
    url = new URL(withScheme);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return null;
  } catch { return null; }
  let candidate: string | null = null;
  if (url.hostname === "youtu.be") {
    candidate = /^\/([A-Za-z0-9_-]{11})\/?$/u.exec(url.pathname)?.[1] ?? null;
  } else if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
    if (url.pathname === "/watch" && url.searchParams.getAll("v").length === 1) candidate = url.searchParams.get("v");
    else candidate = /^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})\/?$/u.exec(url.pathname)?.[1] ?? null;
  } else if (["youtube-nocookie.com", "www.youtube-nocookie.com"].includes(url.hostname)) {
    candidate = /^\/embed\/([A-Za-z0-9_-]{11})\/?$/u.exec(url.pathname)?.[1] ?? null;
  }
  return isYoutubeVideoId(candidate) ? candidate : null;
}

/**
 * Supplementary text observations only: names, abbreviations and transcript punctuation
 * affect these estimates. No lexical threshold assigns CEFR, quality, or speaking speed.
 * Source: CEFR Companion Volume (2020), audiovisual reception, pp. 52-53.
 * https://rm.coe.int/cefr-companion-volume-with-new-descriptors-2020/16809ea0d4
 */
export function transcriptSignals(text: string): TranscriptSignals {
  const words = text.toLowerCase().match(/[\p{L}]+(?:['’][\p{L}]+)*/gu) ?? [];
  const sentenceCount = text.split(/[.!?]+/u).filter((part) => /\p{L}/u.test(part)).length;
  return {
    method: "orthographic_heuristics_v1", supplementaryOnly: true,
    wordCount: words.length,
    uniqueWordFraction: words.length ? new Set(words).size / words.length : 0,
    longWordFraction: words.length ? words.filter((word) => word.replace(/['’]/gu, "").length >= 7).length / words.length : 0,
    approximateSentenceCount: sentenceCount,
    meanWordsPerSentence: sentenceCount ? words.length / sentenceCount : 0,
  };
}

/**
 * A1/A2: supported familiar everyday meaning. B1/B2: connected speech and sustained
 * explanation. C1/C2: nuance, idiom and demanding task/context evidence; audiovisual
 * CEFR has no separate C2 descriptor. Difficulty depends on task and support.
 * Publisher labels establish recommended suitability, not unseen acoustic properties.
 * All assessments below are independent editorial inputs: YouTube titles, API tags,
 * likes and views do not contribute to classification or quality scores.
 * https://developers.google.com/youtube/terms/developer-policies (III.E.4.h)
 * https://developers.google.com/youtube/v3/docs/captions/download
 */
export function evaluateEditorialReview(input: unknown, options: EditorialPolicyOptions = {}): EditorialDecision {
  const invalid: PolicyReason[] = [];
  const fail = (code: string, message: string) => invalid.push({ code, message });
  if (!record(input)) return { decision: "reject", reasons: [{ code: "invalid_review", message: "Review must be an object." }], editorial: null };
  const now = options.now ?? new Date();
  const videoId = normalizeYoutubeVideoId(input.videoId);
  if (!videoId) fail("invalid_video_id", "An exact YouTube video ID or supported URL is required.");
  if (!isLevel(input.level) || !isLevel(input.levelMin) || !isLevel(input.levelMax)) fail("invalid_level", "Level and range must use A1, A2, B1, B2, C1 or C2.");
  else if (LEVELS.indexOf(input.levelMin) > LEVELS.indexOf(input.level) || LEVELS.indexOf(input.level) > LEVELS.indexOf(input.levelMax)) fail("invalid_level_range", "The suggested level must lie within an ordered evidence range.");
  const topics = Array.isArray(input.topics) && input.topics.length > 0 && input.topics.length <= 5
    && input.topics.every((topic) => boundedString(topic, 80)) ? normalizeTopics(input.topics) : [];
  if (!topics.length || topics.some((topic) => !TOPICS.some((known) => known === topic))) fail("invalid_topics", "Provide one to five supported editorial topics.");
  if (!boundedString(input.format, 80)) fail("invalid_format", "A bounded editorial format is required.");
  if (!boundedString(input.reviewer, 200)) fail("invalid_reviewer", "A reviewer or editorial source owner must be recorded.");
  if (!validDate(input.reviewedAt, now)) fail("invalid_review_date", "Review date must be a valid ISO date and not in the future.");
  if (!isValue(input.learningValue) || !isValue(input.contentValue)) fail("invalid_value", "Learning and content value must be strong, adequate or weak.");
  if (!isConfidence(input.confidence)) fail("invalid_confidence", "Confidence must be high, medium or low.");
  const evidence = record(input.evidence) ? input.evidence : null;
  const sourceUrl = evidence ? httpsUrl(evidence.sourceUrl) : null;
  if (!evidence) fail("invalid_evidence", "Evidence is required.");
  else {
    if (evidence.kind !== "publisher_cefr" && evidence.kind !== "human_review" && evidence.kind !== "authorized_transcript") fail("invalid_evidence_kind", "Only publisher, human review or authorized transcript evidence is supported.");
    if (!sourceUrl) fail("invalid_evidence_url", "Evidence must link to an HTTPS source without credentials or a custom port.");
    if (!boundedString(evidence.statement, 4000)) fail("invalid_evidence_statement", "Provide a bounded explanation of the matching level evidence.");
    if (!validDate(evidence.checkedAt, now)) fail("invalid_evidence_date", "Evidence check date must be a valid ISO date and not in the future.");
    if (typeof evidence.englishConfirmed !== "boolean" || typeof evidence.exactVideoMatch !== "boolean") fail("invalid_evidence_flags", "English and exact-video checks must be explicit booleans.");
    if (evidence.coverage !== undefined && evidence.coverage !== "whole_video" && evidence.coverage !== "excerpt") fail("invalid_coverage", "Evidence coverage must be whole_video or excerpt.");
    if (evidence.rightsBasis !== undefined && !boundedString(evidence.rightsBasis, 2000)) fail("invalid_rights_basis", "Rights basis must be nonempty and bounded when supplied.");
  }
  const audio = input.audioReview;
  if (audio !== undefined) {
    if (!record(audio) || typeof audio.intelligible !== "boolean" || typeof audio.observedSeconds !== "number" || !Number.isFinite(audio.observedSeconds) || audio.observedSeconds <= 0
      || (audio.backgroundNoise !== undefined && audio.backgroundNoise !== "minimal" && audio.backgroundNoise !== "noticeable" && audio.backgroundNoise !== "obscures_speech")
      || (audio.overlappingSpeech !== undefined && typeof audio.overlappingSpeech !== "boolean")
      || (audio.notes !== undefined && !boundedString(audio.notes, 2000))) fail("invalid_audio_review", "Audio claims require an explicit intelligibility check and positive actual listening coverage.");
  }
  const transcript = input.transcript;
  if (transcript !== undefined && (!record(transcript) || !boundedString(transcript.text, MAX_TRANSCRIPT_CHARACTERS) || !boundedString(transcript.rightsBasis, 2000))) fail("invalid_transcript", "Transcripts require bounded text and a recorded rights basis.");
  if (invalid.length) return { decision: "reject", reasons: invalid, editorial: null };

  // The checks above validate every copied field; reconstruct explicitly to discard
  // provider statistics, accidental extra properties, and transcript contents.
  const raw = input as unknown as EditorialReview;
  const checkedEvidence: EditorialReview["evidence"] = {
    kind: raw.evidence.kind, sourceUrl: sourceUrl!.href, checkedAt: raw.evidence.checkedAt,
    statement: raw.evidence.statement.trim(), englishConfirmed: raw.evidence.englishConfirmed,
    exactVideoMatch: raw.evidence.exactVideoMatch,
    ...(raw.evidence.rightsBasis ? { rightsBasis: raw.evidence.rightsBasis.trim() } : {}),
    ...(raw.evidence.coverage ? { coverage: raw.evidence.coverage } : {}),
  };
  const rejected: PolicyReason[] = [];
  const deferred: PolicyReason[] = [];
  if (raw.learningValue === "weak" || raw.contentValue === "weak") rejected.push({ code: "insufficient_editorial_value", message: "Both learning and content value must be at least adequate." });
  if (raw.audioReview && (!raw.audioReview.intelligible || raw.audioReview.backgroundNoise === "obscures_speech")) rejected.push({ code: "unintelligible_audio", message: "Reviewed audio does not support a reliable listening task." });
  if (!raw.evidence.englishConfirmed) deferred.push({ code: "english_unconfirmed", message: "Confirm spoken English from publisher evidence, authorized content or actual review." });
  if (!raw.evidence.exactVideoMatch) deferred.push({ code: "video_match_unconfirmed", message: "Evidence must identify this exact video; a channel or similar title is insufficient." });
  if (raw.evidence.coverage === "excerpt") deferred.push({ code: "excerpt_only_evidence", message: "Excerpt evidence cannot approve the whole video; review the full video or use an explicit segment workflow." });
  if (raw.evidence.kind === "publisher_cefr") {
    const trusted = options.trustedPublisherHosts ?? TRUSTED_PUBLISHER_HOSTS;
    if (!trusted.some((host) => host.toLowerCase() === sourceUrl!.hostname)) deferred.push({ code: "untrusted_publisher", message: "This publisher requires an explicit trust review before its CEFR labels can approve content." });
    if (raw.level === "C2" && LEVELS.indexOf(raw.levelMax) - LEVELS.indexOf(raw.levelMin) > 1) deferred.push({ code: "broad_publisher_range", message: "A broad suitability range cannot establish C2 as the starting level; retain a lower starting level or obtain a specific review." });
  }
  if (raw.evidence.kind === "authorized_transcript" && (!raw.transcript || !raw.evidence.rightsBasis)) deferred.push({ code: "authorized_transcript_missing", message: "Transcript assessment requires authorized text and a recorded evidence rights basis." });
  if ((raw.level === "A1" || raw.level === "A2") && raw.confidence === "low") deferred.push({ code: "beginner_confidence_low", message: "Beginner recommendations need at least medium confidence in suitability." });
  if (rejected.length) return { decision: "reject", reasons: [...rejected, ...deferred], editorial: null };
  if (deferred.length) return { decision: "defer", reasons: deferred, editorial: null };

  const audioReview: AudioReview | null = raw.audioReview ? {
    intelligible: raw.audioReview.intelligible, observedSeconds: raw.audioReview.observedSeconds,
    ...(raw.audioReview.backgroundNoise !== undefined ? { backgroundNoise: raw.audioReview.backgroundNoise } : {}),
    ...(raw.audioReview.overlappingSpeech !== undefined ? { overlappingSpeech: raw.audioReview.overlappingSpeech } : {}),
    ...(raw.audioReview.notes !== undefined ? { notes: raw.audioReview.notes.trim() } : {}),
  } : null;
  return {
    decision: "approve", reasons: [], editorial: {
      videoId: videoId!, level: raw.level, levelMin: raw.levelMin, levelMax: raw.levelMax,
      levelBasis: "suggested_starting_level", topics, format: raw.format.trim().toLowerCase(),
      evidence: checkedEvidence, reviewer: raw.reviewer.trim(), reviewedAt: raw.reviewedAt,
      learningValue: raw.learningValue, contentValue: raw.contentValue, confidence: raw.confidence,
      qualityScore: (VALUE_POINTS[raw.learningValue] + VALUE_POINTS[raw.contentValue]) / 2,
      classificationConfidence: CONFIDENCE_VALUES[raw.confidence], confidenceKind: "qualitative_rubric",
      audioReview, transcriptSignals: raw.transcript ? transcriptSignals(raw.transcript.text) : null,
    },
  };
}

export type DurationBounds = { minSeconds: number; maxSeconds: number };
export type DurationOverrides = Partial<Record<VidMatchLevel, Partial<DurationBounds>>>;

/** An eligibility gate only. Longer/shorter never means better quality or higher CEFR. */
export function durationPolicy(level: VidMatchLevel, overrides: DurationOverrides = {}): DurationBounds {
  if (!isLevel(level)) throw new TypeError("Unknown CEFR level.");
  const beginner = level === "A1" || level === "A2";
  const intermediate = level === "B1" || level === "B2";
  const bounds = { minSeconds: beginner ? 60 : 120, maxSeconds: (beginner ? 15 : intermediate ? 25 : 45) * 60, ...overrides[level] };
  if (!Number.isInteger(bounds.minSeconds) || !Number.isInteger(bounds.maxSeconds) || bounds.minSeconds <= 0 || bounds.maxSeconds < bounds.minSeconds) throw new TypeError("Duration bounds must be positive ordered integer seconds.");
  return bounds;
}
export function checkDuration(level: VidMatchLevel, durationSeconds: unknown, overrides: DurationOverrides = {}): boolean {
  const bounds = durationPolicy(level, overrides);
  return typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds >= bounds.minSeconds && durationSeconds <= bounds.maxSeconds;
}

export type DiversityCandidate = {
  videoId: string;
  level: VidMatchLevel;
  channelId: string;
  topics: readonly string[];
  format: string;
  /** Independent editorial scores from an approved review; never provider statistics. */
  qualityScore: number;
  classificationConfidence: number;
};
export type DiversityOptions = {
  targetPerLevel?: number;
  maxPerLevelChannel?: number;
  existing?: readonly DiversityCandidate[];
};

/**
 * Select only already-approved candidates. Counts include the existing catalog, so
 * repeated imports cannot bypass the channel cap. Underrepresented channels, topics
 * and formats get the next turn; editorial quality/confidence then break ties.
 * Returns fewer than the target when evidence/diversity supply is insufficient.
 */
export function selectDiverseCandidates<T extends DiversityCandidate>(candidates: readonly T[], options: DiversityOptions = {}): T[] {
  const target = options.targetPerLevel ?? 25;
  const cap = options.maxPerLevelChannel ?? 5;
  if (!Number.isInteger(target) || target < 0 || !Number.isInteger(cap) || cap < 1) throw new TypeError("Diversity limits must be nonnegative target and positive channel cap integers.");
  const selected: T[] = [];
  const seen = new Set<string>();
  const channelCounts = new Map<string, number>();
  const topicCounts = new Map<string, number>();
  const formatCounts = new Map<string, number>();
  const levelCounts = new Map<VidMatchLevel, number>();
  const key = (level: VidMatchLevel, value: string) => JSON.stringify([level, value]);
  const add = (map: Map<string, number>, name: string) => map.set(name, (map.get(name) ?? 0) + 1);
  const count = (candidate: DiversityCandidate) => {
    seen.add(candidate.videoId);
    levelCounts.set(candidate.level, (levelCounts.get(candidate.level) ?? 0) + 1);
    add(channelCounts, key(candidate.level, candidate.channelId));
    for (const topic of new Set(candidate.topics)) add(topicCounts, key(candidate.level, topic));
    add(formatCounts, key(candidate.level, candidate.format));
  };
  const valid = (candidate: DiversityCandidate) => isYoutubeVideoId(candidate.videoId) && isLevel(candidate.level)
    && boundedString(candidate.channelId, 200) && boundedString(candidate.format, 80)
    && Array.isArray(candidate.topics) && candidate.topics.length > 0 && candidate.topics.every((topic) => boundedString(topic, 80));
  for (const candidate of options.existing ?? []) if (valid(candidate) && !seen.has(candidate.videoId)) count(candidate);
  const pool = candidates.filter((candidate) => valid(candidate) && !seen.has(candidate.videoId)
    && Number.isFinite(candidate.qualityScore) && candidate.qualityScore >= 0 && candidate.qualityScore <= 100
    && Number.isFinite(candidate.classificationConfidence) && candidate.classificationConfidence >= 0 && candidate.classificationConfidence <= 1);
  const exposure = (candidate: DiversityCandidate) => {
    const topics = [...new Set(candidate.topics)];
    return topics.reduce((total, topic) => total + (topicCounts.get(key(candidate.level, topic)) ?? 0), 0) / topics.length;
  };
  for (const level of LEVELS) {
    while ((levelCounts.get(level) ?? 0) < target) {
      const eligible = pool.filter((candidate) => candidate.level === level && !seen.has(candidate.videoId)
        && (channelCounts.get(key(level, candidate.channelId)) ?? 0) < cap);
      eligible.sort((a, b) => (channelCounts.get(key(level, a.channelId)) ?? 0) - (channelCounts.get(key(level, b.channelId)) ?? 0)
        || exposure(a) - exposure(b)
        || (formatCounts.get(key(level, a.format)) ?? 0) - (formatCounts.get(key(level, b.format)) ?? 0)
        || b.qualityScore - a.qualityScore || b.classificationConfidence - a.classificationConfidence
        || (a.videoId < b.videoId ? -1 : a.videoId > b.videoId ? 1 : 0));
      const next = eligible[0];
      if (!next) break;
      selected.push(next);
      count(next);
    }
  }
  return selected;
}
