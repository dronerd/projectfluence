// Start Next with SUPABASE_URL=http://127.0.0.1:3113 and a dummy service key, then:
// FLUENCE_BASE_URL=http://127.0.0.1:3112 node --test apps/vidmatch/src/services/recommendationApi.test.mjs
// This fixture never contacts a hosted database or YouTube.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
const baseUrl = process.env.FLUENCE_BASE_URL || "http://127.0.0.1:3112";
const fixturePort = Number(process.env.FLUENCE_API_FIXTURE_PORT || 3113);
const videoId = (id) => `video${String(id).padStart(6, "0")}`;
const rows = Array.from({ length: 290 }, (_, index) => ({
  video_id: videoId(index + 1), title: `Editorial lesson ${index + 1}`, channel_name: `Publisher ${index % 6}`, channel_id: `channel-${index % 6}`,
  level: index < 230 ? "C2" : "A1", skills: ["listening"], topics: [["science"], ["Science"], ["Physics"]][index % 3], description: "Description for the visible page",
  thumbnail_url: null, duration: "PT6M", transcript_available: true, availability_status: index === 239 ? "inactive" : "active",
  editorial_reviewed_at: index === 248 ? null : "2026-09-29T00:00:00Z",
  provider_metadata_expires_at: index === 244 ? "2000-01-01T00:00:00Z" : "2099-01-01T00:00:00Z",
}));
rows.push(...["Artificial Intelligence", "Technology", "technology", "food"].map((topic, index) => ({
  ...rows[230], video_id: videoId(901 + index), level: "A2", topics: [topic],
})));
const overlaps = (stored, filter) => {
  if (!filter) return true;
  const values = JSON.parse(`[${filter.slice(4, -1)}]`);
  return stored.some((value) => values.includes(value));
};

test("HTTP recommendations filter before keyset pagination, retain all pages, and exclude unavailable videos", async () => {
  const requests = [];
  let unavailable = false;
  const server = createServer((request, response) => {
    const params = new URL(request.url, `http://127.0.0.1:${fixturePort}`).searchParams;
    requests.push(params);
    response.setHeader("content-type", "application/json");
    if (unavailable) { response.writeHead(503); response.end('{"message":"fixture unavailable"}'); return; }
    let result = rows.filter((row) => {
      if (params.get("availability_status") === "eq.active" && row.availability_status !== "active") return false;
      if (params.get("editorial_reviewed_at") === "not.is.null" && row.editorial_reviewed_at === null) return false;
      if (params.has("provider_metadata_expires_at") && row.provider_metadata_expires_at <= params.get("provider_metadata_expires_at").slice(3)) return false;
      const level = params.get("level");
      if (level?.startsWith("eq.") && row.level !== level.slice(3)) return false;
      if (level?.startsWith("in.") && !level.slice(4, -1).split(",").includes(row.level)) return false;
      if (!overlaps(row.topics, params.get("topics"))) return false;
      const relatedTopics = params.get("or")?.match(/topics\.(ov\.\{[^}]*\})/)?.[1];
      if (relatedTopics && !overlaps(row.topics, relatedTopics)) return false;
      const id = params.get("video_id");
      if (id?.startsWith("eq.") && row.video_id !== id.slice(3)) return false;
      if (id?.startsWith("in.") && !id.slice(4, -1).split(",").includes(row.video_id)) return false;
      const and = params.get("and") || "";
      const after = and.match(/video_id\.gt\.([\w-]+)/)?.[1];
      const excluded = and.match(/video_id\.neq\.([\w-]+)/)?.[1];
      if (after && row.video_id <= after) return false;
      if (excluded && row.video_id === excluded) return false;
      return true;
    });
    result = result.sort((a, b) => a.video_id < b.video_id ? -1 : 1).slice(0, Number(params.get("limit") || 1000));
    response.end(JSON.stringify(result));
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(fixturePort, "127.0.0.1", resolve); });
  const recommend = async (params) => {
    const response = await fetch(`${baseUrl}/api/vidmatch/recommend?${params}`);
    return { response, body: await response.json() };
  };
  try {
    const seen = [];
    let cursor;
    do {
      const params = new URLSearchParams({ level: "A1", limit: "12", topics: "science" });
      if (cursor) params.set("cursor", cursor);
      const { response, body } = await recommend(params);
      assert.equal(response.status, 200, JSON.stringify(body));
      assert.ok(body.videos.every((video) => video.level === "A1"));
      if (!cursor) assert.equal(new Set(body.videos.slice(0, 6).map((video) => video.channel_id)).size, 6);
      seen.push(...body.videos.map((video) => video.video_id));
      cursor = body.nextCursor;
      assert.equal(body.hasMore, Boolean(cursor));
      assert.ok(seen.length <= 60, "pagination makes forward progress without repeats");
    } while (cursor);
    assert.equal(seen.length, 57);
    assert.equal(new Set(seen).size, 57);
    assert.ok(!seen.includes(videoId(240)) && !seen.includes(videoId(245)) && !seen.includes(videoId(249)));
    const related = await recommend(new URLSearchParams({ similar_to: videoId(231), limit: "12" }));
    assert.equal(related.response.status, 200);
    assert.equal(related.body.videos.length, 12);
    assert.ok(related.body.videos.every((video) => video.level === "A1" && video.video_id !== videoId(231)));
    const technology = await recommend(new URLSearchParams({ level: "A2", topics: "technology", limit: "12" }));
    assert.equal(technology.response.status, 200);
    assert.deepEqual(technology.body.videos.map((video) => video.video_id).sort(), [901, 902, 903].map(videoId));
    const relatedLegacy = await recommend(new URLSearchParams({ similar_to: videoId(901), limit: "12" }));
    assert.equal(relatedLegacy.response.status, 200);
    assert.deepEqual(relatedLegacy.body.videos.map((video) => video.video_id).sort(), [902, 903].map(videoId));
    const badCursor = await recommend(new URLSearchParams({ level: "A1", cursor: "tampered" }));
    assert.equal(badCursor.response.status, 400);
    assert.ok(requests.every((params) => params.get("availability_status") === "eq.active" && params.get("editorial_reviewed_at") === "not.is.null" && params.has("provider_metadata_expires_at")));
    assert.ok(requests.every((params) => Number(params.get("limit")) <= 49));
    assert.ok(requests.filter((params) => params.get("select").includes("description")).every((params) => Number(params.get("limit")) <= 12));
    unavailable = true;
    assert.equal((await recommend(new URLSearchParams({ level: "A1" }))).response.status, 503);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
