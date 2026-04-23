// src/utils/speech.ts

let englishVoice: SpeechSynthesisVoice | null = null;
let voicesLoaded = false;

/**
 * Initialize voices and pick the best English voice available.
 * Handles Safari/iOS timing issues.
 */
function initVoices() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return; // voices not yet loaded

  // Try to pick the most natural English voice available
  englishVoice =
    voices.find(v => v.name.includes("Samantha")) || // iOS / macOS US female
    voices.find(v => v.name.includes("Daniel")) ||   // iOS UK male
    voices.find(v => v.lang === "en-US") ||
    voices.find(v => v.lang.startsWith("en")) ||
    null;

  voicesLoaded = true;
}

if (typeof window !== "undefined") {
  // Initialize immediately (for Chrome, desktop)
  initVoices();
  // And listen for delayed loading (iOS Safari)
  window.speechSynthesis.onvoiceschanged = initVoices;
}

/**
 * Speaks text in English with high-quality voice selection.
 * Automatically retries if voices aren’t loaded yet.
 */
export function speakEnglish(text: string) {
  try {
    if (typeof window === "undefined" || !(window as any).speechSynthesis) return;

    // If voices are not ready, wait a bit and try again
    if (!voicesLoaded) {
      setTimeout(() => speakEnglish(text), 300);
      window.speechSynthesis.getVoices(); // trigger load
      return;
    }

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "en-US";
    utter.rate = 1.0;
    utter.pitch = 1.0;

    if (englishVoice) utter.voice = englishVoice;

    (window as any).speechSynthesis.cancel();
    (window as any).speechSynthesis.speak(utter);
  } catch (e) {
    console.error("Speech synthesis failed:", e);
  }
}

/**
 * Optional: manually set a specific voice by name (if you want user customization)
 */
export function setEnglishVoiceByName(name: string) {
  const voices = window.speechSynthesis.getVoices();
  const match = voices.find(v => v.name === name);
  if (match) englishVoice = match;
}

/**
 * Optional: get all available English voices (for making a dropdown)
 */
export function getEnglishVoices(): SpeechSynthesisVoice[] {
  return window.speechSynthesis
    .getVoices()
    .filter(v => v.lang.startsWith("en"));
}
