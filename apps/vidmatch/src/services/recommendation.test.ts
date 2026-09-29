import assert from "node:assert/strict";
import test from "node:test";
import { parseVideoRecommendations, type VidMatchVideo } from "./videoContract.ts";
import { diversifyVideos, learningRelevance } from "./recommendationRanking.ts";
import { CANDIDATE_WINDOW, decodeCursor, encodeCursor, filterFingerprint } from "./recommendationCursor.ts";
import { normalizeTopics, queryTopicValues, TOPICS } from "./videoTaxonomy.ts";

const video = (id: number, channel: string, patch: Partial<VidMatchVideo> = {}): VidMatchVideo => ({
  video_id: `video${String(id).padStart(6, "0")}`, title: "Fixture", channel_name: channel, channel_id: channel,
  youtube_url: "", thumbnail_url: null, duration: "PT5M", level: "B1", skills: ["listening"], topics: ["science"], accent: null,
  transcript_available: false, description: null, tags: [], quality_score: 0, source: "youtube", source_video_id: "", speaker_name: null, source_url: "", ...patch,
});

test("channel round-robin preserves every video and does not let one publisher fill a page", () => {
  const videos = [video(1, "A"), video(2, "A"), video(3, "A"), video(4, "B"), video(5, "B"), video(6, "C")];
  const ordered = diversifyVideos(videos);
  assert.deepEqual(ordered.map((item) => item.channel_id), ["A", "B", "C", "A", "B", "A"]);
  assert.equal(new Set(ordered.map((item) => item.video_id)).size, videos.length);
  assert.deepEqual(diversifyVideos([...videos].reverse()), ordered);
});

test("similar ranking favors nearby learning annotations and ignores provider tags/popularity", () => {
  const source = video(100, "source");
  const distant = video(1, "A", { level: "C2", quality_score: 100, tags: ["science"] });
  const same = video(2, "B", { quality_score: 0 });
  assert.equal(diversifyVideos([distant, same], source)[0].video_id, same.video_id);
  assert.deepEqual(diversifyVideos([video(1, "A", { quality_score: 0 }), video(2, "B", { quality_score: 100 })]).map((item) => item.video_id), [video(1, "A").video_id, video(2, "B").video_id]);
});

test("cursor preserves pending diverse order across pages and rejects another search", () => {
  const fingerprint = filterFingerprint({ level: "A1", topics: ["science"] });
  const ids = diversifyVideos(Array.from({ length: CANDIDATE_WINDOW }, (_, i) => video(i, `channel-${i % 7}`))).map((item) => item.video_id);
  const state = { version: 1 as const, fingerprint, after: video(47, "").video_id, pending: ids.slice(6), more: true };
  assert.deepEqual(decodeCursor(encodeCursor(state), fingerprint), state);
  assert.throws(() => decodeCursor(encodeCursor(state), filterFingerprint({ level: "C2" })));
  assert.equal(new Set([...ids.slice(0, 6), ...decodeCursor(encodeCursor(state), fingerprint).pending]).size, CANDIDATE_WINDOW);
});

test("cursor accepts no unbounded buffers, duplicate IDs, injected filters, or invalid JSON", () => {
  const state = decodeCursor(undefined, "fixture");
  for (const pending of [Array(49).fill(video(1, "").video_id), [video(1, "").video_id, video(1, "").video_id], ["x),level.eq.C2"]]) {
    assert.throws(() => decodeCursor(encodeCursor({ ...state, pending }), "fixture"));
  }
  assert.throws(() => decodeCursor("a".repeat(3001), "fixture"));
  assert.throws(() => decodeCursor(Buffer.from("null").toString("base64url"), "fixture"));
});

test("topic aliases reconcile old ingestion labels, custom input and editorial categories", () => {
  assert.deepEqual(normalizeTopics([" Education & Learning ", "school", "Computer Science & Technology", "cooking", "Medicine & Health", "Music"]), ["school", "technology", "food", "health", "entertainment"]);
  for (const topic of ["psychology", "nature", "creativity", "design"]) assert.ok((TOPICS as readonly string[]).includes(topic));
});

test("query topics retain canonical, title-case and documented legacy labels without changing stored data", () => {
  const values = queryTopicValues(["science", "Technology", "daily life", "school", "environment"]);
  for (const value of ["science", "Science", "Physics", "Biology", "Engineering", "technology", "Technology", "Artificial Intelligence", "Computer Science & Technology", "daily life", "Daily Life", "Routines", "Education", "Environmental Science & Sustainability"]) {
    assert.ok(values.includes(value), `Missing stored topic: ${value}`);
  }
  assert.deepEqual(queryTopicValues(["Artificial Intelligence", "technology"]), queryTopicValues(["technology"]));
  assert.equal(new Set(values).size, values.length);
  assert.ok(queryTopicValues(Array.from({ length: 1000 }, (_, index) => `custom ${index}`)).length <= 20);
  assert.ok(!queryTopicValues(["daily life"]).includes("Street Interviews"));
});

test("similarity treats legacy topic aliases as the same editorial subject", () => {
  const source = video(100, "source", { topics: ["Artificial Intelligence", "Technology"] });
  const related = video(2, "B", { topics: ["technology"] });
  const unrelated = video(1, "A", { topics: ["food"] });
  assert.equal(learningRelevance(related, source) - learningRelevance(unrelated, source), 15);
  assert.equal(diversifyVideos([unrelated, related], source)[0].video_id, related.video_id);
});

test("pagination response is validated while old deployment responses remain readable", () => {
  assert.deepEqual(parseVideoRecommendations({ videos: [] }), { videos: [], nextCursor: null, hasMore: false });
  assert.deepEqual(parseVideoRecommendations({ videos: [], nextCursor: "abc", hasMore: true }), { videos: [], nextCursor: "abc", hasMore: true });
  assert.throws(() => parseVideoRecommendations({ videos: [], nextCursor: null, hasMore: true }));
  assert.throws(() => parseVideoRecommendations({ videos: [], nextCursor: "abc", hasMore: false }));
});
