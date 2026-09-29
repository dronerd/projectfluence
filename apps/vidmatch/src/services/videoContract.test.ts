import assert from "node:assert/strict";
import test from "node:test";
import { isYoutubeVideoId, overlapFilter, parseVideoRows, thumbnailSources, youtubeWatchUrl } from "./videoContract.ts";

const id = "dQw4w9WgXcQ";

test("links are derived from valid IDs and cannot execute stored history URLs", () => {
  assert.equal(youtubeWatchUrl(id), `https://www.youtube.com/watch?v=${id}`);
  for (const value of ["javascript:alert(1)", "../private", "short", "xxxxxxxxxxx?next=evil", "dQw4w9WgXcQ\n"]) {
    assert.equal(isYoutubeVideoId(value), false);
    assert.equal(youtubeWatchUrl(value), null);
  }
  const rows = parseVideoRows([{ video_id: id, title: "Lesson", channel_name: "Teacher", youtube_url: "javascript:alert(1)" }]);
  assert.equal(rows[0].youtube_url, `https://www.youtube.com/watch?v=${id}`);
});

test("thumbnail fallback is finite, deduplicated, HTTPS and on the YouTube image CDN", () => {
  const fallback = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  assert.deepEqual(thumbnailSources(id, fallback), [fallback]);
  assert.deepEqual(thumbnailSources(id, `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`), [`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, fallback]);
  for (const value of ["http://i.ytimg.com/foo", "https://i.ytimg.com.evil.test/image", "https://private.example/image", "data:image/svg+xml,test", "https://secret@i.ytimg.com/foo"]) {
    assert.deepEqual(thumbnailSources(id, value), [fallback]);
  }
  assert.deepEqual(thumbnailSources("invalid", fallback), []);
});

test("PostgreSQL overlap literals preserve punctuation without creating another filter", () => {
  assert.equal(overlapFilter(["daily life", 'he said "hello"', "a,b", "{brace}", "path\\name"]), 'ov.{"daily life","he said \\"hello\\"","a,b","{brace}","path\\\\name"}');
  const params = new URLSearchParams({ topics: overlapFilter(['x"},level.eq.A1']), limit: "6" });
  assert.equal(new URLSearchParams(params.toString()).get("topics"), 'ov.{"x\\"},level.eq.A1"}');
  assert.equal([...params].length, 2);
});

test("malformed API metadata raises an error instead of appearing as zero recommendations", () => {
  assert.throws(() => parseVideoRows({ error: "upstream" }));
  assert.throws(() => parseVideoRows([null]));
  assert.throws(() => parseVideoRows([{ video_id: id, title: 42, channel_name: "Teacher" }]));
  assert.deepEqual(parseVideoRows([]), []);
});

test("old history rows normalize absent arrays and retain history timestamps", () => {
  const rows = parseVideoRows([{ video_id: id, title: "Lesson", channel_name: "Teacher", topics: ["travel", null], quality_score: "85.5", last_clicked_at: "2026-09-01T00:00:00Z" }]);
  assert.deepEqual(rows[0].topics, ["travel"]);
  assert.deepEqual(rows[0].skills, []);
  assert.deepEqual(rows[0].tags, []);
  assert.equal(rows[0].transcript_available, false);
  assert.equal(rows[0].quality_score, 85.5);
  assert.equal((rows[0] as typeof rows[number] & {last_clicked_at: string}).last_clicked_at, "2026-09-01T00:00:00Z");
});
