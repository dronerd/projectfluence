import { test } from "node:test";
import assert from "node:assert/strict";
import { RealtimeConversation, type VoiceTurn, type VoiceStatus } from "./realtimeConversation.ts";

function fixture() {
  const turns: VoiceTurn[] = [], statuses: VoiceStatus[] = [], errors: string[] = [];
  let pauses = 0;
  const audio = { pause: () => { pauses += 1; }, srcObject: null } as unknown as HTMLAudioElement;
  const call = new RealtimeConversation({ audio, connect: async () => ({ sdp: "answer", callId: "rtc_fixture", expiresIn: 300 }),
    disconnect: async () => {}, onStatus: state => statuses.push(state), onTurn: turn => turns.push(turn),
    onError: error => errors.push(error), onPlaybackBlocked: () => {} });
  return { call, turns, statuses, errors, pauses: () => pauses };
}

test("speech and assistant transcripts have stable IDs and finish once, even out of order", () => {
  const { call, turns } = fixture();
  call.handleEvent({ type: "input_audio_buffer.speech_started", item_id: "user1" });
  call.handleEvent({ type: "response.output_audio_transcript.delta", item_id: "ai1", delta: "Hello" });
  call.handleEvent({ type: "response.output_audio_transcript.done", item_id: "ai1", transcript: "Hello!" });
  call.handleEvent({ type: "conversation.item.input_audio_transcription.completed", item_id: "user1", transcript: "How are you?" });
  call.handleEvent({ type: "conversation.item.input_audio_transcription.completed", item_id: "user1", transcript: "How are you?" });
  assert.equal(turns[0].role, "user");
  assert.equal(turns[0].id, turns[3].id);
  assert.equal(turns[1].id, turns[2].id);
  assert.equal(turns.filter(turn => turn.final).length, 2);
  call.close();
});

test("response generation finishing does not label queued audio as listening", () => {
  const { call, statuses } = fixture();
  call.handleEvent({ type: "response.created" });
  call.handleEvent({ type: "output_audio_buffer.started" });
  call.handleEvent({ type: "response.done", response: { status: "completed" } });
  assert.equal(statuses.at(-1), "speaking");
  call.handleEvent({ type: "output_audio_buffer.cleared" });
  assert.equal(statuses.at(-1), "listening");
  call.close();
});

test("transcription failure never saves an invented learner utterance", () => {
  const { call, turns, errors } = fixture();
  call.handleEvent({ type: "input_audio_buffer.speech_started", item_id: "user1" });
  call.handleEvent({ type: "conversation.item.input_audio_transcription.delta", item_id: "user1", delta: "uncertain" });
  call.handleEvent({ type: "conversation.item.input_audio_transcription.failed", item_id: "user1" });
  assert.deepEqual({ text: turns.at(-1)?.text, final: turns.at(-1)?.final }, { text: "", final: true });
  assert.equal(errors.length, 1);
  call.close();
});

test("closing is idempotent and ignores late provider events", () => {
  const { call, turns, statuses, pauses } = fixture();
  call.handleEvent({ type: "input_audio_buffer.speech_started", item_id: "user1" });
  call.close(); call.close();
  const count = turns.length;
  call.handleEvent({ type: "conversation.item.input_audio_transcription.completed", item_id: "user1", transcript: "Too late" });
  assert.equal(turns.length, count);
  assert.equal(statuses.at(-1), "closed");
  assert.equal(pauses(), 1);
});

test("stopping while microphone permission is pending stops late tracks", async () => {
  const { call } = fixture();
  let grant: (stream: MediaStream) => void = () => {};
  let stopped = 0;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const previousPeer = Object.getOwnPropertyDescriptor(globalThis, "RTCPeerConnection");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: {
    getUserMedia: () => new Promise<MediaStream>(resolve => { grant = resolve; }),
  } } });
  Object.defineProperty(globalThis, "RTCPeerConnection", { configurable: true, value: class {} });
  try {
    const starting = call.start();
    call.close();
    grant({ getTracks: () => [{ stop: () => { stopped += 1; } }] } as unknown as MediaStream);
    await starting;
    assert.equal(stopped, 1);
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
    if (previousPeer) Object.defineProperty(globalThis, "RTCPeerConnection", previousPeer);
    else Reflect.deleteProperty(globalThis, "RTCPeerConnection");
  }
});
