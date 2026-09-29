// FLUENCE_BROWSER_TOOLS=/path/to/playwright-install FLUENCE_BASE_URL=http://127.0.0.1:3101 node --test apps/vidmatch/src/services/videoBrowser.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { chromium, baseUrl } from "../../../../scripts/browser-tools.mjs";

const video = {
  video_id: "dQw4w9WgXcQ", title: "English listening lesson", channel_name: "Fixture teacher",
  youtube_url: "javascript:alert('unsafe history URL')", thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
  duration: "PT5M", level: "B1", skills: ["listening"], topics: ["travel"], accent: null,
  transcript_available: false, description: "A fixture lesson", tags: [], quality_score: 85,
};
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=", "base64");

test("VidMatch recovers thumbnail and API failures, keeps native safe video links across viewport sizes", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let apiFailure = false;
    let allImagesFail = false;
    let imageAttempts = 0;
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(baseUrl).origin && url.hostname !== "i.ytimg.com") return route.abort();
      if (url.hostname === "i.ytimg.com") {
        imageAttempts++;
        if (allImagesFail || url.pathname.includes("maxresdefault")) return route.abort();
        return route.fulfill({ contentType: "image/png", body: image });
      }
      if (url.pathname === "/api/vidmatch/recommend") {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return route.fulfill({ status: apiFailure ? 503 : 200, json: apiFailure ? { error: "Service unavailable" } : { videos: [video] } });
      }
      return route.continue();
    });
    await page.goto(`${baseUrl}/vidmatch`);
    const search = page.getByRole("button", { name: "動画を探す", exact: false });
    await search.click();
    await page.getByText("動画を読み込んでいます…", { exact: true }).waitFor();
    const card = page.locator(".vm-video-card");
    await card.waitFor();
    await card.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector(".vm-thumbnail img")?.getAttribute("src")?.endsWith("hqdefault.jpg") && document.querySelector(".vm-thumbnail img")?.naturalWidth > 0);
    assert.equal(imageAttempts, 2, "one failed source, one successful fallback");
    const link = card.getByRole("link", { name: /YouTubeで見る/ });
    assert.equal(await link.getAttribute("href"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(await link.getAttribute("target"), "_blank");
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no horizontal overflow at ${width}px`);
    }
    apiFailure = true;
    await search.click();
    await page.getByRole("button", { name: "もう一度試す", exact: true }).waitFor();
    apiFailure = false;
    await page.getByRole("button", { name: "もう一度試す", exact: true }).click();
    await card.waitFor();
    allImagesFail = true;
    await page.reload();
    await search.click();
    await card.waitFor();
    await card.scrollIntoViewIfNeeded();
    await page.getByText("画像を読み込めませんでした", { exact: false }).waitFor();
    assert.equal(await link.getAttribute("href"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "video remains usable without a thumbnail");
    allImagesFail = false;
    await page.getByRole("button", { name: "画像を再読み込み" }).click();
    await page.waitForFunction(() => document.querySelector(".vm-thumbnail img")?.naturalWidth > 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
