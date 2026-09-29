/** Progressive MP3 playback where supported; one download with a Blob fallback.
 * No sentence splitting: the provider generates one continuous utterance.
 */
export async function playVoiceResponse(
  response: Response,
  audio: HTMLAudioElement,
  signal: AbortSignal,
  setUrl: (url: string) => void,
  onBlocked: () => void,
  onFirstByte: () => void,
) {
  let playStarted = false;
  let blocked = false;
  let playAttempt = 0;
  let fatalError: Error | null = null;
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The audio response has no body.");
  function beginPlayback() {
    if (playStarted || signal.aborted) return;
    playStarted = true;
    const attempt = ++playAttempt;
    void audio.play().catch((error: unknown) => {
      if (signal.aborted || attempt !== playAttempt) return;
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        blocked = true;
        onBlocked();
      } else {
        if (!source) fatalError = new Error("Audio playback failed.");
        audio.dispatchEvent(new Event("error"));
      }
    });
  }
  let source: MediaSource | null = null;
  let buffer: SourceBuffer | null = null;
  const mediaError = () => {
    if (source && audio.currentTime === 0) {
      // A browser can advertise MP3 MSE and still reject the actual decoder.
      // Keep downloading once, then play those bytes through the native Blob path.
      source = null; buffer = null; playStarted = false; playAttempt += 1;
    } else {
      fatalError = new Error("Audio playback failed.");
      void reader?.cancel().catch(() => {});
    }
  };
  audio.addEventListener("error", mediaError);
  if (typeof MediaSource !== "undefined" && MediaSource.isTypeSupported("audio/mpeg") && response.body) {
    try {
      source = new MediaSource();
      const opened = waitForEvent(source, "sourceopen", signal, undefined, audio);
      const url = URL.createObjectURL(source);
      setUrl(url);
      audio.src = url;
      await opened;
      buffer = source.addSourceBuffer("audio/mpeg");
    } catch (error) {
      if (signal.aborted) {
        audio.removeEventListener("error", mediaError);
        await reader.cancel().catch(() => {}); reader.releaseLock();
        throw error;
      }
      source = null;
      buffer = null;
    }
  }
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const activeReader = reader;
  const cancel = () => { void activeReader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await activeReader.read();
      signal.throwIfAborted();
      if (fatalError) throw fatalError;
      if (done) break;
      if (!chunks.length) onFirstByte();
      size += value.length;
      if (size > 12 * 1024 * 1024) throw new Error("The audio response is too large.");
      chunks.push(new Uint8Array(value));
      if (buffer) {
        try {
          const activeBuffer = buffer;
          await waitForEvent(activeBuffer, "updateend", signal, () => activeBuffer.appendBuffer(chunks[chunks.length - 1]), audio);
          beginPlayback();
        } catch (error) {
          if (signal.aborted || audio.currentTime > 0) throw error;
          // Unsupported decoding before playback can use the same downloaded bytes.
          buffer = null;
          source = null;
          playStarted = false; playAttempt += 1;
        }
      }
    }
    if (fatalError) throw fatalError;
    if (!size) throw new Error("The audio response is empty.");
    if (source?.readyState === "open") source.endOfStream();
    if (!buffer || blocked) {
      const url = URL.createObjectURL(new Blob(chunks, { type: "audio/mpeg" }));
      setUrl(url);
      audio.src = url;
      if (!blocked) beginPlayback();
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    audio.removeEventListener("error", mediaError);
    await activeReader.cancel().catch(() => {});
    activeReader.releaseLock();
  }
  if (fatalError) throw fatalError;
}

function waitForEvent(target: EventTarget, name: string, signal: AbortSignal, action?: () => void, failureTarget?: EventTarget) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(name, done);
      target.removeEventListener("error", fail);
      failureTarget?.removeEventListener("error", fail);
      signal.removeEventListener("abort", abort);
      clearTimeout(timer);
    };
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("Audio buffering failed.")); };
    const abort = () => { cleanup(); reject(signal.reason ?? new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(fail, 15000);
    target.addEventListener(name, done, { once: true });
    target.addEventListener("error", fail, { once: true });
    failureTarget?.addEventListener("error", fail, { once: true });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    else if (action) { try { action(); } catch (error) { cleanup(); reject(error); } }
  });
}
