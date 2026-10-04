import assert from "node:assert/strict";
import test from "node:test";
import { playAnswerSound, speakVocabulary, vocabularyAudioUrl } from "./speech.ts";

test("prepared audio URL matches the generator for the same word and example", () => {
  assert.equal(vocabularyAudioUrl("apple", "I eat an apple after lunch."), "/vocabstream/audio/v1/8948f4dd82268e08.m4a");
  assert.equal(vocabularyAudioUrl(" apple ", " I eat an apple after lunch. "), vocabularyAudioUrl("apple", "I eat an apple after lunch."));
});

test("prepared audio plays from the click and falls back when a clip is unavailable", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousAudio = Object.getOwnPropertyDescriptor(globalThis, "Audio");
  const previousUtterance = Object.getOwnPropertyDescriptor(globalThis, "SpeechSynthesisUtterance");
  const utterances: string[] = [];
  const audioInstances: Array<{ src: string; onerror: (() => void) | null; paused: boolean }> = [];
  class FakeAudio {
    src: string;
    onerror: (() => void) | null = null;
    onended: (() => void) | null = null;
    paused = false;
    constructor(src: string) { this.src = src; audioInstances.push(this); }
    play() { return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  class FakeUtterance { lang = ""; rate = 1; text: string; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(text: string) { this.text = text; } }
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: FakeAudio });
  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", { configurable: true, value: FakeUtterance });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { speechSynthesis: { cancel() {}, getVoices: () => [], speak: (utterance: FakeUtterance) => utterances.push(utterance.text) } } });
  try {
    speakVocabulary("apple", "I eat an apple after lunch.");
    assert.equal(audioInstances[0].src, vocabularyAudioUrl("apple", "I eat an apple after lunch."));
    assert.deepEqual(utterances, []);
    audioInstances[0].onerror?.();
    assert.deepEqual(utterances, ["apple. I eat an apple after lunch."]);
    speakVocabulary("solution", "We need a solution.");
    speakVocabulary("confident", "She felt confident.");
    assert.equal(audioInstances[1].paused, true);
    audioInstances[1].onerror?.();
    assert.equal(utterances.length, 1, "a canceled reading cannot start late fallback speech");
  } finally {
    for (const [key, descriptor] of [["window", previousWindow], ["Audio", previousAudio], ["SpeechSynthesisUtterance", previousUtterance]] as const) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

class FakeAudioParam {
  events: { kind: string; value: number }[] = [];
  setValueAtTime(value: number) { this.events.push({ kind: "set", value }); }
  linearRampToValueAtTime(value: number) { this.events.push({ kind: "linear", value }); }
  exponentialRampToValueAtTime(value: number) { this.events.push({ kind: "exponential", value }); }
  cancelScheduledValues() { this.events.push({ kind: "cancel", value: 0 }); }
  setTargetAtTime(value: number) { this.events.push({ kind: "target", value }); }
}

class FakeGain {
  gain = new FakeAudioParam();
  disconnected = false;
  connect() { /* Web Audio routing is checked by scheduled nodes below. */ }
  disconnect() { this.disconnected = true; }
}

class FakeOscillator {
  frequency = { value: 0 };
  type = "sine";
  starts: number[] = [];
  stops: number[] = [];
  onended: (() => void) | null = null;
  connect() { /* Web Audio routing is checked by scheduled nodes below. */ }
  disconnect() { /* No persistent resource in the fake. */ }
  start(time: number) { this.starts.push(time); }
  stop(time: number) { this.stops.push(time); }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state = "suspended";
  currentTime = 10;
  destination = {};
  gains: FakeGain[] = [];
  oscillators: FakeOscillator[] = [];
  resumeCalls = 0;
  constructor() { FakeAudioContext.instances.push(this); }
  createGain() { const gain = new FakeGain(); this.gains.push(gain); return gain; }
  createOscillator() { const oscillator = new FakeOscillator(); this.oscillators.push(oscillator); return oscillator; }
  resume() { this.resumeCalls++; this.state = "running"; return Promise.resolve(); }
}

test("answer clicks schedule audible, distinct positive and gentle negative cues immediately", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { AudioContext: FakeAudioContext } });
  try {
    playAnswerSound(true);
    const context = FakeAudioContext.instances.at(-1)!;
    assert.equal(context.resumeCalls, 1);
    assert.deepEqual(context.oscillators.map(note => note.frequency.value), [523.25, 659.25, 783.99]);
    assert.ok(context.oscillators.every(note => note.type === "triangle" && note.starts.length === 1 && note.stops.length === 1));
    assert.ok(context.gains.some(gain => gain.gain.events.some(event => event.kind === "linear" && event.value >= .09)));

    const firstOutput = context.gains[0];
    playAnswerSound(false);
    assert.equal(FakeAudioContext.instances.length, 1, "reuse the unlocked audio context");
    assert.deepEqual(context.oscillators.slice(3).map(note => note.frequency.value), [392, 329.63]);
    assert.ok(firstOutput.gain.events.some(event => event.kind === "target" && event.value === 0), "fade a previous cue before the next answer");
    context.oscillators.forEach(note => note.onended?.());
    assert.ok(firstOutput.disconnected);
    assert.ok(context.gains[4].disconnected);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
