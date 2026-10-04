export type VoiceStatus = "connecting" | "listening" | "thinking" | "speaking" | "closed";
export type VoiceTurn = { id: string; role: "user" | "assistant"; text: string; final: boolean; inputMethod: "typed" | "speech" };
type Options = {
  audio: HTMLAudioElement;
  connect: (sdp: string, signal: AbortSignal) => Promise<{ sdp: string; callId: string; expiresIn: number }>;
  disconnect: (callId: string) => Promise<unknown>;
  onStatus: (status: VoiceStatus) => void;
  onTurn: (turn: VoiceTurn) => void;
  onError: (message: string) => void;
  onPlaybackBlocked: () => void;
};

/** One browser-owned WebRTC call; no API credentials or audio buffers in React. */
export class RealtimeConversation {
  private options: Options;
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private abort = new AbortController();
  private callId: string | null = null;
  private expiry: ReturnType<typeof setTimeout> | null = null;
  private turns = new Map<string, VoiceTurn>();
  private responding = false;
  private playing = false;
  private closed = false;
  private ready = false;

  constructor(options: Options) { this.options = options; }

  async start() {
    const { options } = this;
    options.onStatus("connecting");
    const timeout = setTimeout(() => this.fail("音声接続に時間がかかっています。もう一度お試しください。"), 45000);
    try {
      if (typeof RTCPeerConnection === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("このブラウザでは音声会話を利用できません。文字入力で続けられます。");
      }
      // Permission is requested only after the learner explicitly starts voice.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (this.closed) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      const peer = new RTCPeerConnection(); this.peer = peer;
      stream.getTracks().forEach(track => {
        peer.addTrack(track, stream);
        track.onended = () => this.fail("マイクが切断されました。接続を確認して音声会話を再開してください。");
      });
      peer.ontrack = event => {
        if (this.closed) return;
        options.audio.srcObject = event.streams[0] || new MediaStream([event.track]);
        void options.audio.play().catch(() => { if (!this.closed) options.onPlaybackBlocked(); });
      };
      peer.onconnectionstatechange = () => {
        if (["failed", "disconnected"].includes(peer.connectionState)) this.fail("音声接続が切れました。文字入力で続けるか、音声会話を再開してください。");
      };
      const channel = peer.createDataChannel("oai-events"); this.channel = channel;
      channel.onmessage = event => {
        if (this.closed) return;
        try { this.handleEvent(JSON.parse(event.data)); }
        catch { this.fail("音声会話の応答を読み取れませんでした。再接続してください。"); }
      };
      channel.onclose = () => { if (!this.closed) this.fail("音声会話が終了しました。文字入力で続けられます。"); };
      channel.onerror = () => this.fail("音声会話に接続できませんでした。もう一度お試しください。");
      const opened = new Promise<void>((resolve, reject) => {
        const aborted = () => reject(new DOMException("Aborted", "AbortError"));
        this.abort.signal.addEventListener("abort", aborted, { once: true });
        channel.onopen = () => { this.abort.signal.removeEventListener("abort", aborted); resolve(); };
      });
      // Attach rejection immediately, even if signaling fails before awaiting it.
      void opened.catch(() => {});
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      this.abort.signal.throwIfAborted();
      const answer = await options.connect(offer.sdp || "", this.abort.signal);
      if (this.closed) { void options.disconnect(answer.callId).catch(() => {}); return; }
      this.callId = answer.callId;
      await peer.setRemoteDescription({ type: "answer", sdp: answer.sdp });
      await opened;
      if (this.closed) return;
      this.ready = true;
      this.expiry = setTimeout(() => this.fail("音声会話の接続時間が終了しました。必要なら再開できます。"), answer.expiresIn * 1000);
      options.onStatus("listening");
    } catch (error) {
      if (!this.closed) this.fail(error instanceof DOMException && error.name === "NotAllowedError"
        ? "マイクの使用が許可されていません。ブラウザの設定で許可するか、文字で入力してください。"
        : error instanceof Error ? error.message : "音声会話を開始できませんでした。");
    } finally { clearTimeout(timeout); }
  }

  setMuted(muted: boolean) {
    this.stream?.getAudioTracks().forEach(track => { track.enabled = !muted; });
  }

  sendText(text: string, id: string) {
    if (!this.ready || this.closed || this.responding || this.playing) throw new Error("AIの返答が終わってから送信してください。");
    const itemId = `item_${id.replaceAll("-", "").slice(0, 24)}`;
    this.turns.set(itemId, { id, role: "user", text, final: true, inputMethod: "typed" });
    this.send({ type: "conversation.item.create", item: { id: itemId, type: "message", role: "user", content: [{ type: "input_text", text }] } });
    this.send({ type: "response.create" });
    this.responding = true;
    this.options.onStatus("thinking");
  }

  private send(event: Record<string, unknown>) {
    if (this.channel?.readyState !== "open") throw new Error("音声接続が切れました。再接続してください。");
    this.channel.send(JSON.stringify(event));
  }

  private turn(itemId: string, role: VoiceTurn["role"], text?: string, final = false) {
    if (!itemId || this.closed) return;
    const prior = this.turns.get(itemId);
    if (prior?.final) return;
    const turn: VoiceTurn = { id: prior?.id || crypto.randomUUID(), role, text: text ?? prior?.text ?? "", final, inputMethod: "speech" };
    this.turns.set(itemId, turn);
    this.options.onTurn(turn);
  }

  // Exported through the class so protocol ordering and failures can be tested offline.
  handleEvent(event: { type: string; item_id?: string; delta?: string; transcript?: string; response?: { status?: string }; error?: { code?: string } }) {
    if (this.closed) return;
    const id = event.item_id || "";
    if (event.type === "input_audio_buffer.speech_started") {
      this.turn(id, "user");
    } else if (event.type === "input_audio_buffer.speech_stopped") {
      this.options.onStatus("thinking");
    } else if (event.type === "conversation.item.input_audio_transcription.delta") {
      this.turn(id, "user", (this.turns.get(id)?.text || "") + (event.delta || ""));
    } else if (event.type === "conversation.item.input_audio_transcription.completed") {
      this.turn(id, "user", event.transcript || "", true);
    } else if (event.type === "conversation.item.input_audio_transcription.failed") {
      this.turn(id, "user", "", true);
      this.options.onError("音声の文字起こしに失敗しました。この発言は保存されません。文字で入力し直してください。");
    } else if (event.type === "response.output_audio_transcript.delta") {
      this.turn(id, "assistant", (this.turns.get(id)?.text || "") + (event.delta || ""));
    } else if (event.type === "response.output_audio_transcript.done") {
      this.turn(id, "assistant", event.transcript || this.turns.get(id)?.text || "", true);
    } else if (event.type === "response.created") {
      this.responding = true; this.options.onStatus("thinking");
    } else if (event.type === "output_audio_buffer.started") {
      this.playing = true; this.options.onStatus("speaking");
    } else if (["output_audio_buffer.stopped", "output_audio_buffer.cleared"].includes(event.type)) {
      this.playing = false;
      if (!this.responding) this.options.onStatus("listening");
    } else if (event.type === "response.done") {
      this.responding = false;
      if (event.response?.status === "failed" || event.response?.status === "incomplete") {
        this.options.onError("音声の返答を完了できませんでした。もう一度話すか、文字で入力してください。");
      }
      if (!this.playing) this.options.onStatus("listening");
    } else if (event.type === "error") {
      this.fail("音声サービスでエラーが発生しました。文字入力で続けるか、音声会話を再開してください。");
    }
  }

  private fail(message: string) { if (!this.closed) { this.options.onError(message); this.close(); } }

  close() {
    if (this.closed) return;
    // Never turn interim speech recognition into learner evidence.
    const pendingSpeech = [...this.turns.values()].some(turn => turn.role === "user" && !turn.final);
    if (pendingSpeech) this.options.onError("文字起こし中の発言は保存されませんでした。必要なら文字で入力してください。");
    for (const turn of this.turns.values()) {
      if (!turn.final) this.options.onTurn({ ...turn, text: turn.role === "assistant" ? turn.text : "", final: true });
    }
    this.closed = true;
    this.ready = false;
    this.abort.abort();
    if (this.expiry) clearTimeout(this.expiry);
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    this.channel?.close(); this.peer?.close();
    this.options.audio.pause(); this.options.audio.srcObject = null;
    if (this.callId) void this.options.disconnect(this.callId).catch(() => {});
    this.options.onStatus("closed");
  }
}
