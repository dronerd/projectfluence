import assert from "node:assert/strict";
import { test } from "node:test";
import { playVoiceResponse } from "./voicePlayback.ts";

function fakeAudio(blocked = false) {
  let plays = 0;
  const audio = Object.assign(new EventTarget(), {
    src: "", currentTime: 0,
    play: async () => { plays += 1; if (blocked) throw new DOMException("Blocked", "NotAllowedError"); },
  }) as unknown as HTMLAudioElement;
  return { audio, plays: () => plays };
}

test("unsupported streaming browsers use the same complete MP3 download", async () => {
  const { audio, plays } = fakeAudio();
  let firstByte = 0;
  let objectUrl = "";
  const response = new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/mpeg" } });
  await playVoiceResponse(response, audio, new AbortController().signal, (url) => { objectUrl = url; }, () => assert.fail("not blocked"), () => { firstByte += 1; });
  assert.equal(plays(), 1);
  assert.equal(firstByte, 1);
  assert.deepEqual(new Uint8Array(await (await fetch(objectUrl)).arrayBuffer()), new Uint8Array([1, 2, 3]));
  URL.revokeObjectURL(objectUrl);
});

test("autoplay rejection provides an explicit manual-play recovery", async () => {
  const { audio } = fakeAudio(true);
  let blocked = 0;
  let objectUrl = "";
  await playVoiceResponse(new Response(new Uint8Array([1])), audio, new AbortController().signal,
    (url) => { objectUrl = url; }, () => { blocked += 1; }, () => {});
  assert.equal(blocked, 1);
  assert.equal(audio.src, objectUrl);
  URL.revokeObjectURL(objectUrl);
});

test("Realtime WAV keeps its content type for native playback and replay", async () => {
  const { audio, plays } = fakeAudio();
  let objectUrl = "";
  const response = new Response(new Uint8Array([82, 73, 70, 70]), { headers: { "content-type": "audio/wav" } });
  await playVoiceResponse(response, audio, new AbortController().signal, url => { objectUrl = url; }, () => assert.fail("not blocked"), () => {});
  assert.equal((await fetch(objectUrl)).headers.get("content-type"), "audio/wav");
  assert.equal(plays(), 1);
  URL.revokeObjectURL(objectUrl);
});

test("canceling a pending stream releases its reader and prevents playback", async () => {
  const { audio, plays } = fakeAudio();
  const controller = new AbortController();
  let canceled = false;
  const response = new Response(new ReadableStream({ cancel() { canceled = true; } }));
  const playing = playVoiceResponse(response, audio, controller.signal, () => assert.fail("no url"), () => {}, () => {});
  controller.abort();
  await assert.rejects(playing, { name: "AbortError" });
  assert.equal(canceled, true);
  assert.equal(plays(), 0);
});

test("empty audio fails clearly without starting playback", async () => {
  const { audio, plays } = fakeAudio();
  await assert.rejects(playVoiceResponse(new Response(new Uint8Array()), audio, new AbortController().signal, () => {}, () => {}, () => {}), /empty/);
  assert.equal(plays(), 0);
});

test("streaming-capable browsers start playback before the response finishes", async (t) => {
  class BufferSource extends EventTarget {
    appendBuffer() { queueMicrotask(() => this.dispatchEvent(new Event("updateend"))); }
  }
  class StreamSource extends EventTarget {
    static isTypeSupported() { return true; }
    readyState = "open";
    constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event("sourceopen"))); }
    addSourceBuffer() { return new BufferSource(); }
    endOfStream() { this.readyState = "ended"; }
  }
  const oldMediaSource = globalThis.MediaSource;
  Object.defineProperty(globalThis, "MediaSource", { configurable: true, writable: true, value: StreamSource });
  t.after(() => { Object.defineProperty(globalThis, "MediaSource", { configurable: true, writable: true, value: oldMediaSource }); });
  t.mock.method(URL, "createObjectURL", () => "blob:fixture");
  const { audio, plays } = fakeAudio();
  let input: ReadableStreamDefaultController<Uint8Array> | undefined;
  const response = new Response(new ReadableStream<Uint8Array>({ start(controller) { input = controller; controller.enqueue(new Uint8Array([1, 2])); } }));
  let finished = false;
  const playing = playVoiceResponse(response, audio, new AbortController().signal, () => {}, () => {}, () => {}).then(() => { finished = true; });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(plays(), 1);
  assert.equal(finished, false);
  input!.enqueue(new Uint8Array([3, 4]));
  input!.close();
  await playing;
  assert.equal(plays(), 1, "Do not overlap or restart the same utterance");
});

test("a media-element decode error before playback falls back without aborting the download", async (t) => {
  const { audio, plays } = fakeAudio();
  class BufferSource extends EventTarget {
    appendBuffer() { queueMicrotask(() => audio.dispatchEvent(new Event("error"))); }
  }
  class StreamSource extends EventTarget {
    static isTypeSupported() { return true; }
    readyState = "open";
    constructor() { super(); queueMicrotask(() => this.dispatchEvent(new Event("sourceopen"))); }
    addSourceBuffer() { return new BufferSource(); }
  }
  const oldMediaSource = globalThis.MediaSource;
  Object.defineProperty(globalThis, "MediaSource", { configurable: true, writable: true, value: StreamSource });
  t.after(() => { Object.defineProperty(globalThis, "MediaSource", { configurable: true, writable: true, value: oldMediaSource }); });
  const createUrl = URL.createObjectURL.bind(URL);
  t.mock.method(URL, "createObjectURL", (input: Blob) => input instanceof Blob ? createUrl(input) : "blob:failed-media-source");
  const controller = new AbortController();
  const urls: string[] = [];
  await playVoiceResponse(new Response(new Uint8Array([1, 2, 3])), audio, controller.signal,
    (url) => { urls.push(url); }, () => {}, () => {});
  assert.equal(controller.signal.aborted, false);
  assert.equal(urls.length, 2);
  assert.equal(plays(), 1);
  assert.deepEqual(new Uint8Array(await (await fetch(urls[1])).arrayBuffer()), new Uint8Array([1, 2, 3]));
  URL.revokeObjectURL(urls[1]);
});


test("a Blob decoder rejection cannot become a silent successful playback", async () => {
  const { audio } = fakeAudio();
  audio.play = async () => { throw new DOMException("Decode failed", "NotSupportedError"); };
  let url = "";
  await assert.rejects(playVoiceResponse(new Response(new Uint8Array([1])), audio, new AbortController().signal,
    (value) => { url = value; }, () => {}, () => {}), /playback failed/);
  URL.revokeObjectURL(url);
});
