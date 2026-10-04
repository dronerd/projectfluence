let preferredVoice: SpeechSynthesisVoice | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;

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
/** A brief answer cue, started only by the learner's answer click. */
export function playAnswerSound(correct: boolean) {
  if (typeof window === "undefined") return;
  const Audio = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Audio) return;
  try {
    feedbackContext ??= new Audio();
    const context = feedbackContext;
    const play = () => {
      const start = context.currentTime;
      // A short ascending major arpeggio makes a correct answer feel rewarding.
      const notes = correct
        ? [{ frequency: 523.25, delay: 0, length: .22, volume: .045 }, { frequency: 659.25, delay: .09, length: .22, volume: .045 }, { frequency: 783.99, delay: .18, length: .23, volume: .05 }, { frequency: 1046.5, delay: .29, length: .3, volume: .055 }]
        : [{ frequency: 440, delay: 0, length: .16, volume: .025 }];
      notes.forEach(({ frequency, delay, length, volume }) => {
        const noteStart = start + delay;
        const gain = context.createGain();
        gain.gain.setValueAtTime(.001, noteStart);
        gain.gain.exponentialRampToValueAtTime(volume, noteStart + .015);
        gain.gain.exponentialRampToValueAtTime(.001, noteStart + length);
        gain.connect(context.destination);
        const oscillator = context.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        oscillator.start(noteStart);
        oscillator.stop(noteStart + length);
      });
    };
    if (context.state === "suspended") void context.resume().then(play).catch(() => undefined);
    else play();
  } catch { /* Visual feedback remains available when audio is unavailable. */ }
}
