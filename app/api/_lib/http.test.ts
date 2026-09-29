import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ApiError, apiError, fetchWithTimeout, readJsonBody } from "./http.ts";
import { getAuthenticatedUser, secureTokenMatches, supabaseServiceHeaders } from "./supabaseAuth.ts";
import { parseSummaryBody } from "../speakwise/validation.ts";

const originalFetch = globalThis.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_ANON_KEY;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = originalKey;
});
const authenticatedRequest = () => new Request("http://localhost/api", { headers: { Authorization: "Bearer fixture" } });

test("missing or malformed sessions never reach the database/provider", async () => {
  globalThis.fetch = async () => { throw new Error("unexpected network request"); };
  assert.equal(await getAuthenticatedUser(new Request("http://localhost")), null);
  await assert.rejects(getAuthenticatedUser(new Request("http://localhost", { headers: { Authorization: "Basic fixture" } })), (error: unknown) => error instanceof ApiError && error.status === 401);
});

test("tokens are verified by Supabase, auth failures and outages are distinct", async () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_ANON_KEY = "publishable-fixture";
  for (const status of [401, 403, 500, 429]) {
    globalThis.fetch = async (_url, init) => {
      assert.equal(init?.cache, "no-store");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture");
      return Response.json({ message: "private provider detail" }, { status });
    };
    await assert.rejects(getAuthenticatedUser(authenticatedRequest()), (error: unknown) => error instanceof ApiError && error.status === (status < 404 ? 401 : 503));
  }
  globalThis.fetch = async () => Response.json({ id: "00000000-0000-4000-8000-000000000001" });
  assert.equal((await getAuthenticatedUser(authenticatedRequest()))?.id, "00000000-0000-4000-8000-000000000001");
  globalThis.fetch = async () => Response.json({ id: "user-controlled-filter" });
  await assert.rejects(getAuthenticatedUser(authenticatedRequest()));
});

test("JSON bounds count bytes even when Content-Length is missing or false", async () => {
  const request = (body: string, headers = {}) => new Request("http://localhost", { method: "POST", body, headers });
  assert.deepEqual(await readJsonBody(request('{"ok":true}')), { ok: true });
  await assert.rejects(readJsonBody(request("{")), (error: unknown) => error instanceof ApiError && error.status === 400);
  for (const headers of [{}, { "content-length": "1" }]) {
    await assert.rejects(readJsonBody(request(JSON.stringify("日本語"), headers), 5), (error: unknown) => error instanceof ApiError && error.status === 413);
  }
});

test("upstream calls stop at a deadline and do not retry writes", async () => {
  let calls = 0;
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    calls += 1;
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
  });
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(fetchWithTimeout("http://localhost", { method: "POST" }, 10), (error: unknown) => error instanceof ApiError && error.status === 504);
    assert.equal(calls, 1);
  } finally { clearTimeout(keepAlive); }
});

test("public errors and structured logs exclude underlying sensitive content", async () => {
  const originalWarn = console.warn;
  const logs: string[] = [];
  console.warn = (message: string) => { logs.push(message); };
  try {
    const response = apiError(new Error("private-token-and-user-content"), "test");
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(body.requestId);
    assert.equal(JSON.stringify([body, logs]).includes("private-token-and-user-content"), false);
  } finally { console.warn = originalWarn; }
});

test("ingestion tokens fail closed", () => {
  assert.equal(secureTokenMatches(authenticatedRequest(), undefined), false);
  assert.equal(secureTokenMatches(authenticatedRequest(), "fixture"), true);
  assert.equal(secureTokenMatches(authenticatedRequest(), "wrong"), false);
});

test("modern Supabase secret keys are sent as API keys, never as user JWTs", () => {
  assert.deepEqual(supabaseServiceHeaders("sb_secret_fixture"), { apikey: "sb_secret_fixture" });
  assert.deepEqual(supabaseServiceHeaders("legacy-fixture"), { apikey: "legacy-fixture", Authorization: "Bearer legacy-fixture" });
});

test("SpeakWise summary requires a saved session and bounded structured content", () => {
  const valid = { sessionId: "00000000-0000-4000-8000-000000000001", level: "B2", summary: { title: "Practice", mistakes: [{ type: "grammar", correction: "I went" }] } };
  assert.equal(parseSummaryBody(valid).payload.mistakes.length, 1);
  assert.throws(() => parseSummaryBody({ ...valid, sessionId: null }));
  assert.throws(() => parseSummaryBody({ ...valid, level: "invalid" }));
  assert.throws(() => parseSummaryBody({ ...valid, durationMinutes: -1 }));
  assert.throws(() => parseSummaryBody({ ...valid, summary: { mistakes: new Array(31).fill({}) } }));
  assert.throws(() => parseSummaryBody({ ...valid, summary: { recommendations: [null] } }));
});
