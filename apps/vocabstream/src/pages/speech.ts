import audioConfig from "../../audio-config.json" with { type: "json" };

let preferredVoice: SpeechSynthesisVoice | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let activeAudio: HTMLAudioElement | null = null;
let playbackVersion = 0;

const audioVersion = `${audioConfig.version}|${audioConfig.model}|${audioConfig.voice}|${audioConfig.speed}|${audioConfig.instructions}|`;

/** Must match scripts/generate-vocabstream-audio.py, including UTF-8 and the NUL separator. */
export function vocabularyAudioUrl(word: string, example = "") {
  let value = 0xcbf29ce484222325n;
  const bytes = new TextEncoder().encode(`${audioVersion}${word.trim()}\0${example.trim()}`);
  for (const byte of bytes) value = ((value ^ BigInt(byte)) * 0x100000001b3n) & 0xffffffffffffffffn;
  return `/vocabstream/audio/${audioConfig.version}/${value.toString(16).padStart(16, "0")}.${audioConfig.extension}`;
}

/** Play a prepared reading on the original click gesture, with browser speech as a fallback. */
export function speakVocabulary(word: string, example = "") {
  if (typeof window === "undefined") return;
  const text = `${word.trim()}. ${example.trim()}`;
  const version = ++playbackVersion;
  activeAudio?.pause();
  activeAudio = null;
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  try {
    const audio = new Audio(vocabularyAudioUrl(word, example));
    activeAudio = audio;
    const fallback = () => {
      if (version !== playbackVersion || activeAudio !== audio) return;
      activeAudio = null;
      speakEnglish(text);
    };
    audio.onended = () => { if (activeAudio === audio) activeAudio = null; };
    audio.onerror = fallback;
    void audio.play().catch(fallback);
  } catch {
    speakEnglish(text);
  }
}

function availableVoices() {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis.getVoices() : [];
}

/** Use the browser's default voice while installed voices are still loading. */
export function speakEnglish(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const voices = availableVoices();
    const voice = preferredVoice ?? voices.find((item) => item.name.includes("Samantha")) ?? voices.find((item) => item.lang === "en-US") ?? voices.find((item) => item.lang.startsWith("en"));
    window.speechSynthesis.cancel();
    activeUtterance = new SpeechSynthesisUtterance(text);
    activeUtterance.lang = "en-US";
    activeUtterance.rate = 1;
    if (voice) activeUtterance.voice = voice;
    activeUtterance.onend = () => { activeUtterance = null; };
    activeUtterance.onerror = () => { activeUtterance = null; };
    window.speechSynthesis.speak(activeUtterance);
  } catch { activeUtterance = null; }
}
export function setEnglishVoiceByName(name: string) { preferredVoice = availableVoices().find((voice) => voice.name === name) ?? null; }
export function getEnglishVoices(): SpeechSynthesisVoice[] { return availableVoices().filter((voice) => voice.lang.startsWith("en")); }

let feedbackContext: AudioContext | null = null;
let feedbackOutput: GainNode | null = null;
const answerCues = {
  // A clear, rising three-note chime rewards a correct choice without delaying the next question.
  correct: [
    { frequency: 523.25, delay: 0, duration: .18, volume: .09 },
    { frequency: 659.25, delay: .1, duration: .19, volume: .095 },
    { frequency: 783.99, delay: .21, duration: .26, volume: .105 },
  ],
  // A gentle downward pair signals a mistake without sounding like an alarm.
  incorrect: [
    { frequency: 392, delay: 0, duration: .16, volume: .08 },
    { frequency: 329.63, delay: .12, duration: .2, volume: .075 },
  ],
} as const;

/** Play one answer cue directly from the learner's answer click. */
export function playAnswerSound(correct: boolean) {
  if (typeof window === "undefined") return;
  const Audio = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Audio) return;
  try {
    if (!feedbackContext || feedbackContext.state === "closed") {
      feedbackContext = new Audio();
      feedbackOutput = null;
    }
    const context = feedbackContext;
    // Schedule within the click handler; waiting for resume() can lose the mobile gesture.
    if (context.state !== "running") void context.resume().catch(() => undefined);
    const start = context.currentTime + .008;
    if (feedbackOutput) {
      feedbackOutput.gain.cancelScheduledValues(context.currentTime);
      feedbackOutput.gain.setTargetAtTime(0, context.currentTime, .008);
    }
    const output = context.createGain();
    output.gain.setValueAtTime(1, start);
    output.connect(context.destination);
    feedbackOutput = output;
    const notes = correct ? answerCues.correct : answerCues.incorrect;
    notes.forEach(({ frequency, delay, duration, volume }, index) => {
      const noteStart = start + delay;
      const gain = context.createGain();
      gain.gain.setValueAtTime(.001, noteStart);
      gain.gain.linearRampToValueAtTime(volume, noteStart + .012);
      gain.gain.exponentialRampToValueAtTime(.001, noteStart + duration);
      gain.connect(output);
      const oscillator = context.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        if (index === notes.length - 1) {
          output.disconnect();
          if (feedbackOutput === output) feedbackOutput = null;
        }
      };
      oscillator.start(noteStart);
      oscillator.stop(noteStart + duration);
    });
  } catch { /* Visual feedback remains available when audio is unavailable. */ }
}
