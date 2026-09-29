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
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.045, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + .18);
      gain.connect(context.destination);
      const frequencies = correct ? [660, 880] : [440];
      frequencies.forEach((frequency) => { const oscillator = context.createOscillator(); oscillator.frequency.value = frequency; oscillator.connect(gain); oscillator.start(start); oscillator.stop(start + .2); });
    };
    if (context.state === "suspended") void context.resume().then(play).catch(() => undefined);
    else play();
  } catch { /* Visual feedback remains available when audio is unavailable. */ }
}
