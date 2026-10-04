import assert from "node:assert/strict";
import test from "node:test";
import { playAnswerSound } from "./speech.ts";

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
