// FLUENCE_BROWSER_TOOLS=/path/to/playwright FLUENCE_BASE_URL=http://127.0.0.1:3102 node --test apps/vidmatch/src/services/recommendationBrowser.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { chromium, baseUrl } from "../../../../scripts/browser-tools.mjs";
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=", "base64");
const fixture = (id, channel) => ({ video_id: `video${String(id).padStart(6, "0")}`, title: `Learning video ${id}`, channel_name: channel, level: "B1", skills: ["listening"], topics: ["science"], duration: "PT5M", transcript_available: true, thumbnail_url: null });

test("more videos preserve results on failure, avoid duplicates, and reset with a new search", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let failMore = true;
    let rejectCursor = false;
    const searches = [];
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "i.ytimg.com") return route.fulfill({ contentType: "image/png", body: image });
      if (url.origin !== new URL(baseUrl).origin) return route.abort();
      if (url.pathname === "/api/vidmatch/recommend") {
        searches.push(url.searchParams);
        if (url.searchParams.has("cursor")) {
          if (rejectCursor) return route.fulfill({ status: 400, json: { error: "Search changed", code: "invalid_cursor" } });
          if (failMore) return route.fulfill({ status: 503, json: { error: "temporary failure" } });
          return route.fulfill({ json: { videos: [fixture(2, "B"), fixture(3, "C")], nextCursor: null, hasMore: false } });
        }
        return route.fulfill({ json: { videos: [fixture(1, "A"), fixture(2, "B")], nextCursor: "fixture-cursor", hasMore: true } });
      }
      return route.continue();
    });
    await page.goto(`${baseUrl}/vidmatch`);
    await page.getByRole("button", { name: "動画を探す", exact: true }).click();
    await page.getByRole("button", { name: "もっと動画を見る", exact: true }).waitFor();
    assert.equal(await page.locator(".vm-video-card").count(), 2);
    await page.getByRole("button", { name: "もっと動画を見る", exact: true }).click();
    await page.getByRole("button", { name: "続きをもう一度読み込む", exact: true }).waitFor();
    assert.equal(await page.locator(".vm-video-card").count(), 2);
    failMore = false;
    await page.getByRole("button", { name: "続きをもう一度読み込む", exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll(".vm-video-card").length === 3);
    assert.equal(await page.getByRole("button", { name: "もっと動画を見る", exact: true }).count(), 0);
    assert.equal(searches[1].get("cursor"), "fixture-cursor");
    await page.getByText("トピック・アクセントなど", { exact: false }).click();
    await page.getByRole("button", { name: "科学", exact: true }).click();
    await page.getByLabel("その他のトピック", { exact: true }).fill("Education & Learning, cooking");
    await page.getByRole("button", { name: "動画を探す", exact: true }).click();
    await page.getByRole("button", { name: "もっと動画を見る", exact: true }).waitFor();
    assert.equal(await page.locator(".vm-video-card").count(), 2);
    assert.equal(searches.at(-1).has("cursor"), false);
    assert.deepEqual(searches.at(-1).getAll("topics"), ["science", "school", "food"]);
    rejectCursor = true;
    await page.getByRole("button", { name: "もっと動画を見る", exact: true }).click();
    await page.getByRole("button", { name: "動画一覧を更新", exact: true }).waitFor();
    assert.equal(await page.locator(".vm-video-card").count(), 2);
    rejectCursor = false;
    await page.getByRole("button", { name: "動画一覧を更新", exact: true }).click();
    await page.getByRole("button", { name: "もっと動画を見る", exact: true }).waitFor();
    assert.equal(searches.at(-1).has("cursor"), false);
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
