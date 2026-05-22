import React, { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
type LessonMode =
  | "natural_conversation"
  | "vocabulary_phrase"
  | "grammar_practice"
  | "speaking_practice"
  | "pronunciation_practice"
  | "listening_practice"
  | "reading_comprehension"
  | "pdf_reading"
  | "writing_feedback"
  | "deep_discussion"
  | "review_weakness";

type ChatEntry = {
  sender: "user" | "assistant";
  text: string;
  audioLoading?: boolean;
};

type LearnerMemory = {
  recentSummaries?: Array<Record<string, unknown>>;
  mistakePatterns?: Array<Record<string, unknown>>;
  vocabProgress?: Array<Record<string, unknown>>;
  weakVocabItems?: Array<Record<string, unknown>>;
  vidmatchHistory?: Array<Record<string, unknown>>;
  recommendations?: string[];
};

type LessonSummary = {
  title?: string;
  covered?: string[];
  strengths?: string[];
  weaknesses?: string[];
  recommendations?: string[];
  usefulVocabulary?: string[];
  mistakes?: Array<{
    type: string;
    original?: string;
    correction?: string;
    explanation?: string;
  }>;
};

type SpeakWiseSettings = {
  level: CEFRLevel;
  durationMinutes: number;
  lessonMode: LessonMode | "";
  selectedTopics: string[];
  customTopic: string;
  directStart: boolean;
  voiceEnabled: boolean;
  selectedVoice: string;
  pdfContext: string;
};

const SPEAKWISE_API_URL =
  process.env.NEXT_PUBLIC_SPEAKWISE_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

const LEVELS: CEFRLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

const TOPICS = [
  "Daily life",
  "Travel",
  "Technology",
  "Business",
  "School",
  "Health",
  "Culture",
  "Environment",
  "Academic topics",
  "Current events",
];

const LESSON_MODES: Array<{ id: LessonMode; label: string; short: string }> = [
  { id: "natural_conversation", label: "Natural Conversation", short: "Flexible conversation with light correction" },
  { id: "vocabulary_phrase", label: "Vocabulary & Phrases", short: "Reuse VocabStream words with spaced review" },
  { id: "grammar_practice", label: "Grammar Practice", short: "Target recurring grammar mistakes" },
  { id: "speaking_practice", label: "Speaking Practice", short: "Longer answers, fluency, expression" },
  { id: "pronunciation_practice", label: "Pronunciation Practice", short: "Sound, stress, and rhythm drills" },
  { id: "listening_practice", label: "Listening Practice", short: "Short spoken-style prompts and questions" },
  { id: "reading_comprehension", label: "Reading Comprehension", short: "Adaptive short texts and questions" },
  { id: "pdf_reading", label: "PDF-Based Reading", short: "Practice from an uploaded or pasted text" },
  { id: "writing_feedback", label: "Writing & Feedback", short: "Paragraph writing and revision" },
  { id: "deep_discussion", label: "Deep Discussion", short: "Nuanced advanced argumentation" },
  { id: "review_weakness", label: "Review & Weakness", short: "Train repeated mistakes from memory" },
];

const DEFAULT_SETTINGS: SpeakWiseSettings = {
  level: "B2",
  durationMinutes: 15,
  lessonMode: "",
  selectedTopics: [],
  customTopic: "",
  directStart: false,
  voiceEnabled: false,
  selectedVoice: "alloy",
  pdfContext: "",
};

const VOICES = ["alloy", "ash", "coral", "echo", "fable", "nova", "sage", "shimmer"];

function isLessonMode(value: unknown): value is LessonMode {
  return typeof value === "string" && LESSON_MODES.some((mode) => mode.id === value);
}

function isLevel(value: unknown): value is CEFRLevel {
  return typeof value === "string" && LEVELS.includes(value as CEFRLevel);
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function sanitizeSettings(value: unknown): SpeakWiseSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<SpeakWiseSettings>;
  return {
    level: isLevel(raw.level) ? raw.level : DEFAULT_SETTINGS.level,
    durationMinutes: [5, 10, 15, 20, 25, 30, 45, 60].includes(Number(raw.durationMinutes))
      ? Number(raw.durationMinutes)
      : DEFAULT_SETTINGS.durationMinutes,
    lessonMode: isLessonMode(raw.lessonMode) ? raw.lessonMode : "",
    selectedTopics: readStringArray(raw.selectedTopics).filter((topic) => TOPICS.includes(topic)),
    customTopic: typeof raw.customTopic === "string" ? raw.customTopic : "",
    directStart: Boolean(raw.directStart),
    voiceEnabled: Boolean(raw.voiceEnabled),
    selectedVoice: typeof raw.selectedVoice === "string" && VOICES.includes(raw.selectedVoice)
      ? raw.selectedVoice
      : DEFAULT_SETTINGS.selectedVoice,
    pdfContext: typeof raw.pdfContext === "string" ? raw.pdfContext.slice(0, 8000) : "",
  };
}

function summarizeMemory(memory: LearnerMemory | null) {
  if (!memory) return "No stored learner memory loaded yet.";
  const recent = memory.recentSummaries?.[0] as { summary?: LessonSummary; mode?: string } | undefined;
  const patterns = (memory.mistakePatterns || []).slice(0, 3).map((item) => {
    const row = item as { mistake_type?: string; pattern?: string; count?: number };
    return [row.mistake_type, row.pattern, row.count ? `${row.count}x` : ""].filter(Boolean).join(" ");
  });
  const vocab = (memory.vocabProgress || []).slice(0, 3).map((item) => {
    const row = item as { lesson_title?: string; genre?: string; percent_score?: number };
    return [row.lesson_title || row.genre, typeof row.percent_score === "number" ? `${row.percent_score}%` : ""].filter(Boolean).join(" ");
  });
  const videos = (memory.vidmatchHistory || []).slice(0, 2).map((item) => {
    const row = item as { title?: string; topics?: string[]; level?: string };
    return [row.title, row.level, row.topics?.join(", ")].filter(Boolean).join(" ");
  });

  return [
    recent?.summary?.title ? `Last lesson: ${recent.summary.title}` : "",
    recent?.summary?.weaknesses?.length ? `Recent weaknesses: ${recent.summary.weaknesses.join(", ")}` : "",
    patterns.length ? `Repeated mistake patterns: ${patterns.join("; ")}` : "",
    vocab.length ? `VocabStream context: ${vocab.join("; ")}` : "",
    videos.length ? `VidMatch context: ${videos.join("; ")}` : "",
  ].filter(Boolean).join("\n") || "No strong prior learning signals yet.";
}

export default function AIChat() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settings, setSettings] = useState<SpeakWiseSettings>(DEFAULT_SETTINGS);
  const [memory, setMemory] = useState<LearnerMemory | null>(null);
  const [chatLog, setChatLog] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [lessonActive, setLessonActive] = useState(false);
  const [lessonStartedAt, setLessonStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [summary, setSummary] = useState<LessonSummary | null>(null);
  const [pendingModeChoice, setPendingModeChoice] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const autoEndedRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const topics = useMemo(
    () => [...settings.selectedTopics, settings.customTopic.trim()].filter(Boolean),
    [settings.selectedTopics, settings.customTopic],
  );
  const selectedMode = LESSON_MODES.find((mode) => mode.id === settings.lessonMode);
  const totalSeconds = settings.durationMinutes * 60;
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

  useEffect(() => {
    document.body.style.backgroundColor = "#eef4f8";
    return () => {
      document.body.style.backgroundColor = "";
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      setSettingsLoaded(true);
      return;
    }
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setAccessToken(data.session?.access_token ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token ?? null);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!accessToken) {
      setSettingsLoaded(true);
      setMemory(null);
      return;
    }

    let cancelled = false;
    Promise.all([
      fetch("/api/speakwise/lesson-settings", { headers: { Authorization: `Bearer ${accessToken}` } })
        .then((response) => response.json())
        .then((data) => sanitizeSettings(data.settings)),
      fetch("/api/speakwise/learner-memory", { headers: { Authorization: `Bearer ${accessToken}` } })
        .then((response) => response.json())
        .catch(() => null),
    ]).then(([storedSettings, storedMemory]) => {
      if (cancelled) return;
      if (storedSettings) setSettings(storedSettings);
      if (storedMemory && !storedMemory.error) setMemory(storedMemory);
    }).finally(() => {
      if (!cancelled) setSettingsLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!settingsLoaded || !accessToken) return;
    const timer = window.setTimeout(() => {
      fetch("/api/speakwise/lesson-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ settings }),
      }).catch((error) => console.warn("SpeakWise settings save failed", error));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [accessToken, settings, settingsLoaded]);

  useEffect(() => {
    if (!lessonStartedAt || !lessonActive) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - lessonStartedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lessonActive, lessonStartedAt]);

  useEffect(() => {
    if (!lessonActive || autoEndedRef.current || elapsedSeconds < totalSeconds || chatLog.length < 2) return;
    autoEndedRef.current = true;
    void endLesson();
  }, [chatLog.length, elapsedSeconds, lessonActive, totalSeconds]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatLog, isSending, summary]);

  function updateSettings(patch: Partial<SpeakWiseSettings>) {
    setSettings((prev) => ({ ...prev, ...patch }));
  }

  function toggleTopic(topic: string) {
    updateSettings({
      selectedTopics: settings.selectedTopics.includes(topic)
        ? settings.selectedTopics.filter((item) => item !== topic)
        : [...settings.selectedTopics, topic],
    });
  }

  async function callAgent(userText: string, phase: "start" | "continue" | "end" = "continue") {
    const res = await fetch(`${SPEAKWISE_API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "agent",
        lessonMode: settings.lessonMode || "natural_conversation",
        level: settings.level,
        topics,
        durationMinutes: settings.durationMinutes,
        elapsedSeconds,
        phase,
        message: userText,
        history: chatLog.slice(-12).map((entry) => ({
          role: entry.sender === "assistant" ? "assistant" : "user",
          content: entry.text,
        })),
        learnerMemory: memory,
        pdfContext: settings.pdfContext,
        voiceEnabled: settings.voiceEnabled,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.details || data.error || "SpeakWise request failed");
    return String(data.reply || "").trim();
  }

  async function appendAssistant(text: string) {
    setChatLog((prev) => [...prev, { sender: "assistant", text }]);
    if (settings.voiceEnabled) {
      await playVoice(text);
    }
  }

  async function startLesson(modeOverride?: LessonMode) {
    const nextMode = modeOverride || settings.lessonMode;
    if (!nextMode) {
      setPendingModeChoice(true);
      setChatLog([{ sender: "assistant", text: "How are you today? What would you like to practice?" }]);
      return;
    }

    autoEndedRef.current = false;
    setSummary(null);
    setPendingModeChoice(false);
    setLessonActive(true);
    setLessonStartedAt(Date.now());
    setElapsedSeconds(0);
    setChatLog([]);
    setSessionId(null);

    if (modeOverride) updateSettings({ lessonMode: modeOverride });
    void recordSessionStart(nextMode);

    const label = LESSON_MODES.find((item) => item.id === nextMode)?.label || "English practice";
    const startText = settings.directStart
      ? `Start the lesson naturally. The selected mode is ${label}. Open with a short greeting, connect to memory if useful, then give the first task.`
      : `Greet me naturally with "How are you today?", then begin ${label} step by step. If my selected options are enough, start directly.`;

    setIsSending(true);
    try {
      const reply = await callAgent(startText, "start");
      await appendAssistant(reply);
    } catch (error) {
      setChatLog([{ sender: "assistant", text: "I could not start the lesson. Please check the SpeakWise API connection." }]);
      console.error(error);
    } finally {
      setIsSending(false);
    }
  }

  async function recordSessionStart(lessonMode: LessonMode) {
    if (!accessToken) return;
    try {
      const response = await fetch("/api/speakwise/lesson-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          mode: lessonMode === "writing_feedback" ? "writing" : "speaking",
          lessonMode,
          level: settings.level,
          plannedDurationMinutes: settings.durationMinutes,
          selectedTopics: topics,
          selectedComponents: [lessonMode],
        }),
      });
      const data = await response.json().catch(() => null);
      if (data?.session?.id) setSessionId(data.session.id);
    } catch (error) {
      console.warn("SpeakWise session analytics save failed", error);
    }
  }

  async function sendMessage(override?: string) {
    const text = (override ?? input).trim();
    if (!text || isSending || isEnding) return;
    setInput("");
    setChatLog((prev) => [...prev, { sender: "user", text }]);
    setIsSending(true);
    try {
      const reply = await callAgent(text);
      await appendAssistant(reply);
    } catch (error) {
      console.error(error);
      setChatLog((prev) => [...prev, { sender: "assistant", text: "Sorry, I could not get a response this time." }]);
    } finally {
      setIsSending(false);
    }
  }

  async function endLesson() {
    if (isEnding || chatLog.length === 0) return;
    setIsEnding(true);
    setLessonActive(false);
    try {
      const res = await fetch(`${SPEAKWISE_API_URL}/api/lesson-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonMode: settings.lessonMode || "natural_conversation",
          level: settings.level,
          topics,
          durationMinutes: settings.durationMinutes,
          elapsedSeconds,
          history: chatLog.map((entry) => ({
            role: entry.sender === "assistant" ? "assistant" : "user",
            content: entry.text,
          })),
          learnerMemory: memory,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.details || data.error || "Summary request failed");
      const nextSummary = data.summary as LessonSummary;
      setSummary(nextSummary);
      const farewell = data.farewell || "Great work today. See you next lesson!";
      setChatLog((prev) => [...prev, { sender: "assistant", text: farewell }]);
      if (settings.voiceEnabled) await playVoice(farewell);
      await persistSummary(nextSummary);
    } catch (error) {
      console.error(error);
      setChatLog((prev) => [...prev, { sender: "assistant", text: "Great work today. I could not save the full summary, but the lesson is complete." }]);
    } finally {
      setIsEnding(false);
    }
  }

  async function persistSummary(nextSummary: LessonSummary) {
    if (!accessToken) return;
    try {
      const response = await fetch("/api/speakwise/learner-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          sessionId,
          lessonMode: settings.lessonMode || "natural_conversation",
          level: settings.level,
          durationMinutes: settings.durationMinutes,
          elapsedSeconds,
          topics,
          summary: nextSummary,
        }),
      });
      const data = await response.json().catch(() => null);
      if (data && !data.error) setMemory(data.memory ?? memory);
    } catch (error) {
      console.warn("SpeakWise learner memory save failed", error);
    }
  }

  async function playVoice(text: string) {
    if (!text.trim()) return;
    try {
      audioRef.current?.pause();
      const res = await fetch(`${SPEAKWISE_API_URL}/api/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: settings.selectedVoice }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (error) {
      console.warn("SpeakWise voice playback failed", error);
    }
  }

  function toggleListening() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("This browser does not support speech recognition. Please type your answer.");
      return;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) finalText += `${event.results[i][0].transcript} `;
      }
      if (finalText.trim()) setInput((prev) => [prev, finalText.trim()].filter(Boolean).join(" "));
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  async function handlePdfFile(file: File | null) {
    if (!file) return;
    if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      updateSettings({ pdfContext: (await file.text()).slice(0, 8000) });
      return;
    }
    updateSettings({
      pdfContext: `PDF selected: ${file.name}. If text extraction is unavailable in the browser, ask the learner to paste a relevant excerpt before generating detailed questions.`,
    });
  }

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const memoryPreview = summarizeMemory(memory);

  return (
    <>
      <style>{`
        .sw-page{min-height:100vh;padding:28px 18px 44px;color:#142033}
        .sw-shell{max-width:1180px;margin:0 auto;display:grid;grid-template-columns:340px minmax(0,1fr);gap:18px}
        .sw-panel,.sw-chat{background:#fff;border:1px solid #d6e0ea;border-radius:8px;box-shadow:0 16px 38px rgba(22,38,60,.11)}
        .sw-panel{padding:18px;align-self:start;position:sticky;top:18px}
        .sw-brand{display:flex;align-items:center;gap:12px;margin-bottom:14px}
        .sw-brand img{width:44px;height:44px;border-radius:8px;object-fit:cover}
        .sw-brand h1{font-size:22px;line-height:1;margin:0;color:#12213a}
        .sw-brand p{margin:4px 0 0;color:#64748b;font-size:13px}
        .sw-section{border-top:1px solid #e2e8f0;padding-top:14px;margin-top:14px}
        .sw-label{display:block;font-size:12px;font-weight:800;color:#475569;margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em}
        .sw-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
        .sw-grid.levels{grid-template-columns:repeat(3,minmax(0,1fr))}
        .sw-button,.sw-mode,.sw-icon,.sw-send{border:1px solid #cbd5e1;background:#f8fafc;color:#162033;border-radius:8px;min-height:38px;padding:8px 10px;font-weight:750;cursor:pointer}
        .sw-button.active,.sw-mode.active{background:#195a8a;color:white;border-color:#195a8a}
        .sw-mode{text-align:left;display:block;min-height:76px}
        .sw-mode strong{display:block;font-size:14px}
        .sw-mode span{display:block;margin-top:5px;font-size:12px;line-height:1.35;color:inherit;opacity:.82}
        .sw-input,.sw-select,.sw-textarea{width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:10px;background:#fff;color:#132033;font-size:14px}
        .sw-textarea{min-height:94px;resize:vertical;line-height:1.45}
        .sw-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;color:#334155;font-size:14px}
        .sw-toggle input{width:18px;height:18px}
        .sw-start{width:100%;min-height:44px;border:0;border-radius:8px;background:#1b7f79;color:white;font-weight:850;font-size:15px;cursor:pointer;margin-top:14px}
        .sw-start.secondary{background:#334155}
        .sw-memory{white-space:pre-wrap;background:#f4f8fb;border:1px solid #d9e6ef;border-radius:8px;padding:10px;font-size:12px;line-height:1.5;color:#475569;max-height:180px;overflow:auto}
        .sw-chat{min-height:calc(100vh - 56px);display:flex;flex-direction:column;overflow:hidden}
        .sw-chat-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #e2e8f0;background:#f8fbfd}
        .sw-chat-title{display:flex;align-items:center;gap:10px;min-width:0}
        .sw-chat-title img{width:36px;height:36px;border-radius:8px}
        .sw-chat-title strong{display:block;color:#12213a}
        .sw-chat-title span{display:block;color:#64748b;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:420px}
        .sw-status{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
        .sw-chip{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:6px 9px;font-size:12px;font-weight:800;color:#334155}
        .sw-messages{flex:1;overflow:auto;padding:18px;background:#edf4f8}
        .sw-msg{max-width:78%;margin:0 0 12px;padding:12px 14px;border-radius:8px;line-height:1.6;white-space:pre-wrap}
        .sw-msg.user{margin-left:auto;background:#d8eafa;color:#12213a;text-align:left}
        .sw-msg.assistant{margin-right:auto;background:#fff;color:#162033;border:1px solid #d7e3ed}
        .sw-empty{height:100%;display:grid;place-items:center;text-align:center;color:#64748b;padding:28px}
        .sw-mode-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:14px}
        .sw-summary{margin:12px 0 0;background:#fff;border:1px solid #b8d8d5;border-left:5px solid #1b7f79;border-radius:8px;padding:14px;color:#16302f}
        .sw-summary h2{font-size:16px;margin:0 0 8px}
        .sw-summary ul{margin:6px 0 0;padding-left:20px}
        .sw-composer{border-top:1px solid #d6e0ea;background:#fff;padding:12px;display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:end}
        .sw-composer textarea{min-height:48px;max-height:150px}
        .sw-icon{width:44px;min-height:44px;padding:0;display:grid;place-items:center;font-size:18px}
        .sw-icon.active{background:#1b7f79;color:#fff;border-color:#1b7f79}
        .sw-send{min-height:44px;background:#195a8a;color:white;border-color:#195a8a;padding:0 18px}
        .sw-send:disabled,.sw-start:disabled{opacity:.55;cursor:not-allowed}
        @media(max-width:900px){.sw-shell{grid-template-columns:1fr}.sw-panel{position:static}.sw-chat{min-height:72vh}.sw-msg{max-width:92%}}
        @media(max-width:560px){.sw-page{padding:12px 8px 24px}.sw-chat-head{align-items:flex-start;flex-direction:column}.sw-status{justify-content:flex-start}.sw-grid{grid-template-columns:1fr}.sw-grid.levels{grid-template-columns:repeat(3,1fr)}.sw-composer{grid-template-columns:1fr}.sw-icon,.sw-send{width:100%}}
      `}</style>

      <main className="sw-page">
        <div className="sw-shell">
          <aside className="sw-panel">
            <div className="sw-brand">
              <img src="/images/speakwise.png" alt="" />
              <div>
                <h1>SpeakWise AI</h1>
                <p>Longitudinal English learning agent</p>
              </div>
            </div>

            <div className="sw-section">
              <span className="sw-label">Level</span>
              <div className="sw-grid levels">
                {LEVELS.map((level) => (
                  <button key={level} className={`sw-button ${settings.level === level ? "active" : ""}`} onClick={() => updateSettings({ level })}>
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div className="sw-section">
              <span className="sw-label">Duration</span>
              <select className="sw-select" value={settings.durationMinutes} onChange={(event) => updateSettings({ durationMinutes: Number(event.target.value) })}>
                {[5, 10, 15, 20, 25, 30, 45, 60].map((minutes) => (
                  <option key={minutes} value={minutes}>{minutes} minutes</option>
                ))}
              </select>
            </div>

            <div className="sw-section">
              <span className="sw-label">Topics</span>
              <div className="sw-grid">
                {TOPICS.map((topic) => (
                  <button key={topic} className={`sw-button ${settings.selectedTopics.includes(topic) ? "active" : ""}`} onClick={() => toggleTopic(topic)}>
                    {topic}
                  </button>
                ))}
              </div>
              <input className="sw-input" style={{ marginTop: 8 }} value={settings.customTopic} onChange={(event) => updateSettings({ customTopic: event.target.value })} placeholder="Custom topic" />
            </div>

            <div className="sw-section">
              <span className="sw-label">Lesson Mode</span>
              <div style={{ display: "grid", gap: 8 }}>
                {LESSON_MODES.map((mode) => (
                  <button key={mode.id} className={`sw-mode ${settings.lessonMode === mode.id ? "active" : ""}`} onClick={() => updateSettings({ lessonMode: mode.id })}>
                    <strong>{mode.label}</strong>
                    <span>{mode.short}</span>
                  </button>
                ))}
              </div>
            </div>

            {settings.lessonMode === "pdf_reading" && (
              <div className="sw-section">
                <span className="sw-label">PDF or Text</span>
                <input className="sw-input" type="file" accept=".pdf,.txt,text/plain,application/pdf" onChange={(event) => void handlePdfFile(event.target.files?.[0] ?? null)} />
                <textarea className="sw-textarea" style={{ marginTop: 8 }} value={settings.pdfContext} onChange={(event) => updateSettings({ pdfContext: event.target.value.slice(0, 8000) })} placeholder="Paste a PDF excerpt here for more precise questions." />
              </div>
            )}

            <div className="sw-section">
              <span className="sw-label">Voice</span>
              <label className="sw-toggle">
                <span>AI voice responses</span>
                <input type="checkbox" checked={settings.voiceEnabled} onChange={(event) => updateSettings({ voiceEnabled: event.target.checked })} />
              </label>
              <select className="sw-select" style={{ marginTop: 8 }} value={settings.selectedVoice} onChange={(event) => updateSettings({ selectedVoice: event.target.value })}>
                {VOICES.map((voice) => <option key={voice} value={voice}>{voice}</option>)}
              </select>
              <label className="sw-toggle">
                <span>Start selected mode directly</span>
                <input type="checkbox" checked={settings.directStart} onChange={(event) => updateSettings({ directStart: event.target.checked })} />
              </label>
            </div>

            <button className="sw-start" disabled={isSending || isEnding} onClick={() => void startLesson()}>
              {settings.lessonMode ? "Start Lesson" : "Ask Me What To Practice"}
            </button>
            {lessonActive && (
              <button className="sw-start secondary" disabled={isEnding} onClick={() => void endLesson()}>
                End and Save Summary
              </button>
            )}

            <div className="sw-section">
              <span className="sw-label">Learner Memory</span>
              <div className="sw-memory">{memoryPreview}</div>
            </div>
          </aside>

          <section className="sw-chat">
            <header className="sw-chat-head">
              <div className="sw-chat-title">
                <img src="/images/speakwise.png" alt="" />
                <div>
                  <strong>{selectedMode?.label || "Adaptive lesson"}</strong>
                  <span>{lessonActive ? "SpeakWise is adapting to your stored progress in real time." : "Choose a mode or let SpeakWise ask what you want to practice."}</span>
                </div>
              </div>
              <div className="sw-status">
                <span className="sw-chip">{settings.level}</span>
                <span className="sw-chip">{settings.durationMinutes} min</span>
                {lessonStartedAt && <span className="sw-chip">{formatTime(remainingSeconds)} left</span>}
                <span className="sw-chip">{settings.voiceEnabled ? "Voice on" : "Voice off"}</span>
              </div>
            </header>

            <div className="sw-messages" role="log" aria-live="polite">
              {chatLog.length === 0 ? (
                <div className="sw-empty">
                  <div>
                    <strong>How are you today?</strong>
                    <p>Start a lesson and SpeakWise will use your history, weak points, VocabStream progress, and VidMatch topics where available.</p>
                  </div>
                </div>
              ) : (
                <>
                  {chatLog.map((entry, index) => (
                    <div key={`${entry.sender}-${index}`} className={`sw-msg ${entry.sender}`}>
                      {entry.text}
                      {entry.sender === "assistant" && (
                        <div style={{ marginTop: 8 }}>
                          <button className="sw-button" onClick={() => void playVoice(entry.text)}>Play voice</button>
                        </div>
                      )}
                    </div>
                  ))}

                  {pendingModeChoice && (
                    <div className="sw-mode-actions">
                      {LESSON_MODES.map((mode) => (
                        <button key={mode.id} className="sw-button" onClick={() => void startLesson(mode.id)}>
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {summary && (
                    <div className="sw-summary">
                      <h2>{summary.title || "Lesson Summary"}</h2>
                      {[
                        { label: "Covered", items: summary.covered },
                        { label: "You did well", items: summary.strengths },
                        { label: "Weaknesses", items: summary.weaknesses },
                        { label: "Next steps", items: summary.recommendations },
                        { label: "Useful vocabulary", items: summary.usefulVocabulary },
                      ].map(({ label, items }) => Array.isArray(items) && items.length > 0 && (
                        <div key={label}>
                          <strong>{label}</strong>
                          <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
                        </div>
                      ))}
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </>
              )}
              {isSending && <div className="sw-msg assistant">Thinking...</div>}
              {isEnding && <div className="sw-msg assistant">Preparing your lesson summary...</div>}
            </div>

            <div className="sw-composer">
              <button className={`sw-icon ${isListening ? "active" : ""}`} onClick={toggleListening} title="Voice input" aria-label="Voice input">
                {isListening ? "Stop" : "Mic"}
              </button>
              <textarea
                className="sw-textarea"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Type your answer or question..."
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
              />
              <button className="sw-send" disabled={!input.trim() || isSending || isEnding} onClick={() => void sendMessage()}>
                Send
              </button>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
