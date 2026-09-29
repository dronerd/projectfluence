import assert from "node:assert/strict";
import test from "node:test";
import { requestSignal } from "./browserRequest.ts";

function trackedSignal() {
  const controller = new AbortController();
  const signal = controller.signal;
  const add = signal.addEventListener.bind(signal);
  const remove = signal.removeEventListener.bind(signal);
  let attached = 0;
  signal.addEventListener = (...args: Parameters<typeof signal.addEventListener>) => { attached++; add(...args); };
  signal.removeEventListener = (...args: Parameters<typeof signal.removeEventListener>) => { attached--; remove(...args); };
  return { controller, signal, attached: () => attached };
}

test("deadline works without static AbortSignal browser APIs and detaches parent listeners", async () => {
  const parent = trackedSignal();
  const request = requestSignal(5, [parent.signal]);
  assert.equal(parent.attached(), 1);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(request.signal.aborted, true);
  assert.equal(request.signal.reason.name, "TimeoutError");
  assert.equal(parent.attached(), 0);
});

test("parent cancellation propagates its reason and cleans all other listeners", () => {
  const first = trackedSignal();
  const second = trackedSignal();
  const request = requestSignal(60_000, [first.signal, second.signal]);
  second.controller.abort("navigation");
  assert.equal(request.signal.aborted, true);
  assert.equal(request.signal.reason, "navigation");
  assert.equal(first.attached(), 0);
  assert.equal(second.attached(), 0);
});

test("success disposal is idempotent and does not later abort completed requests", async () => {
  const parent = trackedSignal();
  const request = requestSignal(5, [parent.signal]);
  request.dispose();
  request.dispose();
  parent.controller.abort();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(request.signal.aborted, false);
  assert.equal(parent.attached(), 0);
});

test("an already canceled input aborts immediately without remaining timers/listeners", () => {
  const first = trackedSignal();
  const second = trackedSignal();
  second.controller.abort("already stopped");
  const request = requestSignal(60_000, [first.signal, second.signal]);
  assert.equal(request.signal.aborted, true);
  assert.equal(request.signal.reason, "already stopped");
  assert.equal(first.attached(), 0);
  assert.equal(second.attached(), 0);
});
