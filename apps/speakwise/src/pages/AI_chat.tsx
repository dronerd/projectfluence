import React, { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import AppBrand from "@/app/components/AppBrand";

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
  "";

const LEVELS: CEFRLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const DURATION_OPTIONS = [5, 10, 15, 20, 25, 30];

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

const TOPIC_LABELS: Record<string, string> = {
  "Daily life": "日常生活",
  Travel: "旅行",
  Technology: "テクノロジー",
  Business: "ビジネス",
  School: "学校・留学",
  Health: "健康",
  Culture: "文化",
  Environment: "環境",
  "Academic topics": "学術・教養",
  "Current events": "時事ニュース",
};

const LESSON_MODES: Array<{ id: LessonMode; label: string; labelJa: string; short: string }> = [
  { id: "natural_conversation", label: "Natural Conversation", labelJa: "自然な英会話", short: "興味やレベルに合わせて会話し、大事なミスだけ自然に直します" },
  { id: "vocabulary_phrase", label: "Vocabulary & Phrases", labelJa: "単語・フレーズ練習", short: "VocabStreamで学んだ単語を復習し、例文の中で使えるようにします" },
  { id: "grammar_practice", label: "Grammar Practice", labelJa: "文法練習", short: "よく出る文法ミスを短く説明し、ピンポイントで練習します" },
  { id: "speaking_practice", label: "Speaking Practice", labelJa: "スピーキング練習", short: "少し長めに話す練習をし、流暢さ・正確さ・表現を伸ばします" },
  { id: "pronunciation_practice", label: "Pronunciation Practice", labelJa: "発音練習", short: "音、アクセント、リズムを短いドリルで練習します" },
  { id: "listening_practice", label: "Listening Practice", labelJa: "リスニング練習", short: "短い英文を音声で聞き、内容を確認します" },
  { id: "reading_comprehension", label: "Reading Comprehension", labelJa: "読解練習", short: "レベルに合った短い英文を読み、内容理解を深めます" },
  { id: "pdf_reading", label: "PDF-Based Reading", labelJa: "PDF読解練習", short: "PDFからコピーした英文やテキストファイルで読解を練習します" },
  { id: "writing_feedback", label: "Writing & Feedback", labelJa: "ライティング添削", short: "短い文章を書き、文法・語彙・構成・自然さを改善します" },
  { id: "deep_discussion", label: "Deep Discussion", labelJa: "深いディスカッション", short: "抽象的・学術的な話題で、意見の組み立て方を練習します" },
  { id: "review_weakness", label: "Review & Weakness", labelJa: "苦手を復習", short: "過去のミスや苦手分野をもとに、必要な練習を集中して行います" },
];

const DEFAULT_SETTINGS: SpeakWiseSettings = {
  level: "B2",
  durationMinutes: 15,
  lessonMode: "natural_conversation",
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
    durationMinutes: DURATION_OPTIONS.includes(Number(raw.durationMinutes))
      ? Number(raw.durationMinutes)
      : DEFAULT_SETTINGS.durationMinutes,
    lessonMode: isLessonMode(raw.lessonMode) ? raw.lessonMode : "natural_conversation",
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
  if (!memory) return "レッスンを重ねると、ここに学習の振り返りが表示されます。";
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
    recent?.summary?.title ? `前回のレッスン: ${recent.summary.title}` : "",
    recent?.summary?.weaknesses?.length ? `次に練習したいこと: ${recent.summary.weaknesses.join(", ")}` : "",
    patterns.length ? `復習のポイント: ${patterns.join("; ")}` : "",
    vocab.length ? `VocabStreamの学習状況: ${vocab.join("; ")}` : "",
    videos.length ? `VidMatchの視聴トピック: ${videos.join("; ")}` : "",
  ].filter(Boolean).join("\n") || "レッスンを重ねながら、あなたに合う練習を見つけましょう。";
}

type RecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  start: () => void;
  stop: () => void;
};

const LEVEL_LABELS: Record<CEFRLevel, string> = {
  A1: "入門", A2: "初級", B1: "中級", B2: "中上級", C1: "上級", C2: "熟達",
};

export default function AIChat() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
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
  const [lessonEnded, setLessonEnded] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [summarySaved, setSummarySaved] = useState(false);
  const [retryText, setRetryText] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const recognitionRef = useRef<RecognitionInstance | null>(null);
  const autoEndedRef = useRef(false);
  const endLessonRef = useRef<(() => Promise<void>) | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const settingsRef = useRef<HTMLElement | null>(null);
  const settingsToggleRef = useRef<HTMLButtonElement | null>(null);
  const voiceRequestRef = useRef(0);

  const topics = useMemo(
    () => [...settings.selectedTopics, settings.customTopic.trim()].filter(Boolean),
    [settings.selectedTopics, settings.customTopic],
  );
  const selectedMode = LESSON_MODES.find((mode) => mode.id === settings.lessonMode) || LESSON_MODES[0];
  const totalSeconds = settings.durationMinutes * 60;
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
  const lessonViewStarted = Boolean(lessonStartedAt || chatLog.length || summary || isSending);
  const setupDisabled = lessonActive || isSending || isEnding;

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) { setAccessToken(data.session?.access_token ?? null); setAuthReady(true); }
    }).catch(() => { if (mounted) setAuthReady(true); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token ?? null);
      setAuthReady(true);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [supabase]);

  useEffect(() => {
    if (!authReady) return;
    if (!accessToken) { setSettingsLoaded(true); setMemory(null); return; }
    let cancelled = false;
    setSettingsLoaded(false);
    Promise.all([
      fetch("/api/speakwise/lesson-settings", { headers: { Authorization: `Bearer ${accessToken}` } })
        .then(async (response) => { if (!response.ok) throw new Error(); return response.json(); })
        .then((data) => sanitizeSettings(data.settings)),
      fetch("/api/speakwise/learner-memory", { headers: { Authorization: `Bearer ${accessToken}` } })
        .then(async (response) => { if (!response.ok) throw new Error(); return response.json(); }),
    ]).then(([storedSettings, storedMemory]) => {
      if (cancelled) return;
      if (storedSettings) setSettings(storedSettings);
      if (storedMemory && !storedMemory.error) setMemory(storedMemory);
    }).catch(() => {
      if (!cancelled) setNotice("前回の設定を読み込めませんでした。現在の設定で練習できます。");
    }).finally(() => { if (!cancelled) setSettingsLoaded(true); });
    return () => { cancelled = true; };
  }, [accessToken, authReady]);

  useEffect(() => {
    if (!settingsLoaded || !accessToken) return;
    const timer = window.setTimeout(() => {
      fetch("/api/speakwise/lesson-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ settings }),
      }).then((response) => {
        if (!response.ok) setNotice("設定を保存できませんでした。この画面では引き続き練習できます。");
      }).catch(() => setNotice("設定を保存できませんでした。接続を確認してください。"));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [accessToken, settings, settingsLoaded]);

  useEffect(() => {
    if (!lessonStartedAt || !lessonActive) return;
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - lessonStartedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [lessonActive, lessonStartedAt]);

  useEffect(() => {
    if (!lessonActive || isSending || isEnding || autoEndedRef.current || elapsedSeconds < totalSeconds || chatLog.length < 2) return;
    autoEndedRef.current = true;
    void endLessonRef.current?.();
  }, [chatLog.length, elapsedSeconds, lessonActive, totalSeconds, isSending, isEnding]);

  useEffect(() => {
    const container = chatEndRef.current?.parentElement;
    if (container) container.scrollTop = container.scrollHeight;
  }, [chatLog, isSending, summary, error]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    audioRef.current?.pause();
    voiceRequestRef.current += 1;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  function updateSettings(patch: Partial<SpeakWiseSettings>) {
    setSettings((prev) => ({ ...prev, ...patch }));
  }

  function toggleTopic(topic: string) {
    updateSettings({ selectedTopics: settings.selectedTopics.includes(topic)
      ? settings.selectedTopics.filter((item) => item !== topic) : [...settings.selectedTopics, topic] });
  }

  function showSettings() {
    setOptionsOpen(true);
    requestAnimationFrame(() => settingsRef.current?.focus());
  }

  function closeSettings() {
    setOptionsOpen(false);
    requestAnimationFrame(() => settingsToggleRef.current?.focus());
  }

  async function callAgent(userText: string, phase: "start" | "continue" = "continue", mode = selectedMode.id, history = chatLog) {
    if (!SPEAKWISE_API_URL) throw new Error("レッスンに接続できません。しばらくしてから、もう一度お試しください。");
    const res = await fetch(`${SPEAKWISE_API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "agent", lessonMode: mode, level: settings.level, topics,
        durationMinutes: settings.durationMinutes, elapsedSeconds: phase === "start" ? 0 : elapsedSeconds,
        phase, message: userText,
        history: history.slice(-12).map((entry) => ({ role: entry.sender, content: entry.text })),
        learnerMemory: memory, pdfContext: settings.pdfContext, voiceEnabled: settings.voiceEnabled,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error || !String(data.reply || "").trim()) throw new Error("返答を取得できませんでした。");
    return String(data.reply).trim();
  }

  function appendAssistant(text: string) {
    setChatLog((prev) => [...prev, { sender: "assistant", text }]);
    if (settings.voiceEnabled) void playVoice(text);
  }

  async function startLesson(modeOverride?: LessonMode) {
    if (setupDisabled || !settingsLoaded) return;
    const nextMode = modeOverride || selectedMode.id;
    if (nextMode === "pdf_reading" && !settings.pdfContext.trim()) {
      setError("読解で使いたい英文を貼り付けるか、テキストファイルを選んでください。");
      return;
    }
    stopMedia();
    autoEndedRef.current = false;
    setSummary(null); setSummarySaved(false); setLessonEnded(false); setError(""); setRetryText(null);
    setOptionsOpen(false); setElapsedSeconds(0); setChatLog([]); setInput(""); setSessionId(null);
    updateSettings({ lessonMode: nextMode });
    const label = LESSON_MODES.find((item) => item.id === nextMode)?.label || "English practice";
    const startText = settings.directStart
      ? `Start the lesson naturally. The selected mode is ${label}. Open with a short greeting, then give the first task.`
      : `Greet me naturally with "How are you today?", then begin ${label} step by step.`;
    setIsSending(true);
    try {
      const reply = await callAgent(startText, "start", nextMode, []);
      setLessonStartedAt(Date.now()); setLessonActive(true);
      appendAssistant(reply);
      void recordSessionStart(nextMode);
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch {
      setError("レッスンを開始できませんでした。接続を確認して、もう一度お試しください。");
      setLessonActive(false); setLessonStartedAt(null); setOptionsOpen(true);
    } finally { setIsSending(false); }
  }

  async function recordSessionStart(lessonMode: LessonMode) {
    if (!accessToken) return;
    try {
      const response = await fetch("/api/speakwise/lesson-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ mode: lessonMode === "writing_feedback" ? "writing" : "speaking", lessonMode,
          level: settings.level, plannedDurationMinutes: settings.durationMinutes, selectedTopics: topics, selectedComponents: [lessonMode] }),
      });
      const data = await response.json();
      if (response.ok && data?.session?.id) setSessionId(data.session.id);
    } catch { /* Practice remains available when history is temporarily unavailable. */ }
  }

  async function sendMessage(retry = false) {
    const text = (retry ? retryText : input)?.trim();
    if (!text || !lessonActive || isSending || isEnding) return;
    recognitionRef.current?.stop();
    setInput(""); setError(""); setRetryText(null);
    if (!retry) setChatLog((prev) => [...prev, { sender: "user", text }]);
    setIsSending(true);
    try {
      const history = retry ? chatLog.slice(0, -1) : chatLog;
      appendAssistant(await callAgent(text, "continue", selectedMode.id, history));
    } catch {
      setError("返答を取得できませんでした。回答は残っています。もう一度送信できます。");
      setRetryText(text);
    } finally { setIsSending(false); requestAnimationFrame(() => inputRef.current?.focus()); }
  }

  async function endLesson() {
    if (isEnding || isSending || !chatLog.length) return;
    stopMedia(); setError(""); setRetryText(null); setIsEnding(true); setLessonActive(false); setLessonEnded(true);
    try {
      const res = await fetch(`${SPEAKWISE_API_URL}/api/lesson-summary`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonMode: selectedMode.id, level: settings.level, topics,
          durationMinutes: settings.durationMinutes, elapsedSeconds,
          history: chatLog.map((entry) => ({ role: entry.sender, content: entry.text })), learnerMemory: memory }),
      });
      const data = await res.json();
      if (!res.ok || data.error || !data.summary) throw new Error();
      const nextSummary = data.summary as LessonSummary;
      setSummary(nextSummary);
      setSummarySaved(await persistSummary(nextSummary));
    } catch {
      setError("レッスンは終了しました。振り返りを作成できませんでしたが、会話はこの画面に残っています。");
    } finally { setIsEnding(false); }
  }

  async function persistSummary(nextSummary: LessonSummary) {
    if (!accessToken) return false;
    try {
      const response = await fetch("/api/speakwise/learner-memory", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ sessionId, lessonMode: selectedMode.id, level: settings.level,
          durationMinutes: settings.durationMinutes, elapsedSeconds, topics, summary: nextSummary }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error();
      setMemory(data.memory ?? memory);
      return true;
    } catch {
      setNotice("振り返りは表示できましたが、学習履歴への保存に失敗しました。");
      return false;
    }
  }

  function stopMedia() {
    recognitionRef.current?.stop(); recognitionRef.current = null; setIsListening(false);
    audioRef.current?.pause(); voiceRequestRef.current += 1; setVoiceLoading(false);
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
  }

  async function playVoice(text: string) {
    if (!text.trim() || voiceLoading) return;
    if (!SPEAKWISE_API_URL) { setNotice("音声を再生できません。しばらくしてから、もう一度お試しください。"); return; }
    const requestId = ++voiceRequestRef.current;
    setVoiceLoading(true);
    try {
      audioRef.current?.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const res = await fetch(`${SPEAKWISE_API_URL}/api/voice`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: settings.selectedVoice }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      if (requestId !== voiceRequestRef.current) return;
      const url = URL.createObjectURL(blob); audioUrlRef.current = url;
      const audio = new Audio(url); audioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); if (audioUrlRef.current === url) audioUrlRef.current = null; };
      await audio.play();
    } catch { setNotice("音声を再生できませんでした。もう一度お試しください。"); }
    finally { if (requestId === voiceRequestRef.current) setVoiceLoading(false); }
  }

  function toggleListening() {
    if (!lessonActive || isSending || isEnding) return;
    if (recognitionRef.current) { recognitionRef.current.stop(); return; }
    const speechWindow = window as typeof window & {
      SpeechRecognition?: new () => RecognitionInstance;
      webkitSpeechRecognition?: new () => RecognitionInstance;
    };
    const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) { setNotice("このブラウザは音声入力に対応していません。下の欄に英文を入力して練習できます。"); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US"; recognition.interimResults = true; recognition.continuous = true;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => { setIsListening(false); recognitionRef.current = null; };
    recognition.onerror = (event) => {
      setIsListening(false); recognitionRef.current = null;
      if (event.error !== "aborted") setNotice(event.error === "not-allowed"
        ? "マイクを使うには、ブラウザでマイクの使用を許可してください。文字入力でも練習できます。"
        : "音声を聞き取れませんでした。もう一度話すか、文字で入力してください。");
    };
    recognition.onresult = (event) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) finalText += `${event.results[i][0].transcript} `;
      }
      if (finalText.trim()) setInput((prev) => [prev, finalText.trim()].filter(Boolean).join(" "));
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch { recognitionRef.current = null; setNotice("マイクを開始できませんでした。文字入力で練習できます。"); }
  }

  async function handleTextFile(file: File | null) {
    if (!file) return;
    if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
      try { updateSettings({ pdfContext: (await file.text()).slice(0, 8000) }); }
      catch { setError("ファイルを読み込めませんでした。英文を直接貼り付けてください。"); }
    } else { setError("テキストファイル（.txt）を選んでください。PDFの英文はコピーして貼り付けられます。"); }
  }

  function prepareNextLesson() {
    stopMedia(); setOptionsOpen(true); setLessonEnded(false); setSummary(null); setChatLog([]);
    setLessonStartedAt(null); setElapsedSeconds(0); setInput(""); setError(""); setRetryText(null);
    requestAnimationFrame(() => settingsRef.current?.focus());
  }

  useEffect(() => { endLessonRef.current = endLesson; });

  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;

  return (
    <main id="main-content" className="sw-page">
      <div className={`sw-shell ${lessonViewStarted ? "lesson-started" : "pre-lesson"} ${optionsOpen ? "options-open" : "options-closed"}`}>
        <aside id="sw-settings" className="sw-panel" ref={settingsRef} tabIndex={-1} aria-labelledby="sw-settings-title">
          <div className="sw-panel-head">
            <div><AppBrand app="speakwise" compact className="sw-setup-brand" /><h1 id="sw-settings-title">今日の英語レッスン</h1></div>
            {lessonViewStarted && <button type="button" className="sw-panel-close" onClick={closeSettings}>会話に戻る</button>}
          </div>
          {!settingsLoaded && <p className="sw-note" role="status">前回の設定を読み込んでいます…</p>}
          {error && !lessonViewStarted && <p className="sw-alert" role="alert">{error}</p>}
          <fieldset className="sw-settings-fields" disabled={setupDisabled}>
            <div className="sw-section">
              <label className="sw-label" htmlFor="sw-mode">練習内容</label>
              <select id="sw-mode" className="sw-select" value={selectedMode.id} onChange={(event) => updateSettings({ lessonMode: event.target.value as LessonMode })}>
                {LESSON_MODES.map((mode) => <option key={mode.id} value={mode.id}>{mode.labelJa}</option>)}
              </select>
              <p className="sw-note">{selectedMode.short}</p>
            </div>
            <div className="sw-setting-pair">
              <div><label className="sw-label" htmlFor="sw-level">英語レベル</label><select id="sw-level" className="sw-select" value={settings.level} onChange={(event) => updateSettings({ level: event.target.value as CEFRLevel })}>
                {LEVELS.map((level) => <option key={level} value={level}>{level} · {LEVEL_LABELS[level]}</option>)}
              </select></div>
              <div><label className="sw-label" htmlFor="sw-duration">レッスン時間</label><select id="sw-duration" className="sw-select" value={settings.durationMinutes} onChange={(event) => updateSettings({ durationMinutes: Number(event.target.value) })}>
                {DURATION_OPTIONS.map((minutes) => <option key={minutes} value={minutes}>{minutes}分</option>)}
              </select></div>
            </div>
            {settings.lessonMode === "pdf_reading" && <div className="sw-section">
              <label className="sw-label" htmlFor="sw-reading">読解に使う英文</label>
              <p className="sw-note" id="sw-reading-hint">PDFから英文をコピーするか、テキストファイルを選んでください（最大8,000文字）。</p>
              <textarea id="sw-reading" className="sw-textarea" aria-describedby="sw-reading-hint" value={settings.pdfContext} maxLength={8000} onChange={(event) => updateSettings({ pdfContext: event.target.value })} placeholder="ここに英文を貼り付け" />
              <label className="sw-label sw-file-label" htmlFor="sw-file">テキストファイルを読み込む</label>
              <input id="sw-file" className="sw-file" type="file" accept=".txt,text/plain" onChange={(event) => void handleTextFile(event.target.files?.[0] ?? null)} />
            </div>}
          </fieldset>
          <div className="sw-start-area">
            {lessonActive ? <><p className="sw-note">レッスン中は音声設定のみ変更できます。</p><button className="pf-button pf-button-secondary sw-wide" disabled={isSending || isEnding} onClick={() => void endLesson()}>終了して振り返る</button></>
              : lessonEnded ? <button className="pf-button sw-wide" disabled={isEnding} onClick={prepareNextLesson}>次のレッスンを準備</button>
              : <button className="pf-button sw-wide" disabled={isSending || isEnding || !settingsLoaded} onClick={() => void startLesson()}>{isSending ? "レッスンを準備しています…" : "レッスンを始める"}</button>}
          </div>
          <details className="sw-details">
            <summary>トピック・進め方<span>{topics.length ? `${topics.length}件選択` : "任意"}</span></summary>
            <fieldset className="sw-settings-fields" disabled={setupDisabled}>
              <legend className="sw-label">話してみたいトピック</legend>
              <div className="sw-topics">{TOPICS.map((topic) => <button type="button" key={topic} className={`sw-topic ${settings.selectedTopics.includes(topic) ? "active" : ""}`} aria-pressed={settings.selectedTopics.includes(topic)} onClick={() => toggleTopic(topic)}>{TOPIC_LABELS[topic] || topic}</button>)}</div>
              <label className="sw-label sw-file-label" htmlFor="sw-custom-topic">その他のトピック</label>
              <input id="sw-custom-topic" className="sw-input" value={settings.customTopic} onChange={(event) => updateSettings({ customTopic: event.target.value })} placeholder="例：次の海外旅行" />
              <label className="sw-toggle"><input type="checkbox" checked={settings.directStart} onChange={(event) => updateSettings({ directStart: event.target.checked })} /><span>あいさつを短くして、練習から始める</span></label>
            </fieldset>
          </details>
          <details className="sw-details">
            <summary>音声の設定<span>{settings.voiceEnabled ? "自動再生オン" : "自動再生オフ"}</span></summary>
            <label className="sw-toggle"><input type="checkbox" checked={settings.voiceEnabled} onChange={(event) => updateSettings({ voiceEnabled: event.target.checked })} /><span>AIの返答を自動で読み上げる</span></label>
            <label className="sw-label sw-file-label" htmlFor="sw-voice">読み上げの声</label>
            <select id="sw-voice" className="sw-select" value={settings.selectedVoice} onChange={(event) => updateSettings({ selectedVoice: event.target.value })}>{VOICES.map((voice) => <option key={voice} value={voice}>{voice.charAt(0).toUpperCase() + voice.slice(1)}</option>)}</select>
          </details>
          <details className="sw-details">
            <summary>これまでの学習</summary>
            <p className="sw-memory">{accessToken ? summarizeMemory(memory) : "ログインすると、レッスンの振り返りや学習履歴を次の練習に活かせます。"}</p>
            <a className="sw-text-link" href="/analytics">学習記録を見る →</a>
          </details>
        </aside>

        <section className="sw-chat" aria-label="英語レッスン">
          <header className="sw-chat-head">
            <div className="sw-chat-heading"><h2>{selectedMode.labelJa}</h2><div className="sw-status"><span>{settings.level} · {LEVEL_LABELS[settings.level]}</span><span>{lessonActive ? `残り ${formatTime(remainingSeconds)}` : lessonEnded ? `${formatTime(elapsedSeconds)} 練習` : `${settings.durationMinutes}分のレッスン`}</span></div></div>
            <div className="sw-chat-controls"><button type="button" ref={settingsToggleRef} className="sw-chat-menu" onClick={showSettings} aria-controls="sw-settings" aria-expanded={optionsOpen}>設定</button>
              {lessonActive && <button type="button" className="sw-end" disabled={isSending || isEnding} onClick={() => void endLesson()}>終了する</button>}
            </div>
          </header>
          {lessonActive && <div className="sw-progress" role="progressbar" aria-label="レッスンの経過時間" aria-valuenow={Math.min(elapsedSeconds, totalSeconds)} aria-valuemin={0} aria-valuemax={totalSeconds} aria-valuetext={`${settings.durationMinutes}分中、${Math.floor(elapsedSeconds / 60)}分経過`}><div style={{ width: `${Math.min(100, elapsedSeconds / totalSeconds * 100)}%` }} /></div>}
          <div className="sw-messages" role="log" aria-label="AIとの会話" aria-live="polite" aria-relevant="additions text">
            {!chatLog.length && !isSending && <div className="sw-empty"><h3>文字でも音声でも練習できます</h3><p>「レッスンを始める」を選ぶと、AIから最初の質問が届きます。</p></div>}
            {chatLog.map((entry, index) => <article key={`${entry.sender}-${index}`} className={`sw-msg ${entry.sender}`}><div className="sw-message-head"><span className="sw-sender">{entry.sender === "assistant" ? "SpeakWiseAI" : "あなた"}</span>{entry.sender === "assistant" && <button type="button" className="sw-voice-button" disabled={voiceLoading} onClick={() => void playVoice(entry.text)} aria-label={`AIの${index + 1}番目のメッセージを音声で再生`}>{voiceLoading ? "音声を準備中…" : "音声で聞く"}</button>}</div><p lang="en">{entry.text}</p></article>)}
            {isSending && <div className="sw-msg assistant" role="status"><span className="sw-sender">SpeakWiseAI</span><p>{lessonActive ? "返答を考えています…" : "レッスンを準備しています…"}</p></div>}
            {isEnding && <div className="sw-note" role="status">今日の振り返りをまとめています…</div>}
            {error && lessonViewStarted && <div className="sw-alert" role="alert"><p>{error}</p>{retryText && lessonActive && <button type="button" className="sw-text-link" disabled={isSending} onClick={() => void sendMessage(true)}>もう一度送信</button>}{lessonEnded && !summary && <button type="button" className="sw-text-link" disabled={isEnding} onClick={() => void endLesson()}>振り返りを再作成</button>}</div>}
            {summary && <section className="sw-summary" aria-labelledby="sw-summary-title"><h2 id="sw-summary-title">{summary.title || "今日の振り返り"}</h2>{(summarySaved || !accessToken) && <p className="sw-note">{summarySaved ? "学習履歴に保存しました。" : "ログインすると、今後のレッスンを学習履歴に保存できます。"}</p>}{[
              { label: "練習したこと", items: summary.covered }, { label: "できたこと", items: summary.strengths },
              { label: "次に伸ばしたいこと", items: summary.weaknesses }, { label: "次の練習のヒント", items: summary.recommendations },
              { label: "覚えておきたい表現", items: summary.usefulVocabulary },
            ].map(({ label, items }) => Array.isArray(items) && items.length > 0 && <div className="sw-summary-group" key={label}><h3>{label}</h3><ul>{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>)}</section>}
            <div ref={chatEndRef} />
          </div>
          {notice && lessonViewStarted && <div className="sw-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="お知らせを閉じる">×</button></div>}
          {lessonEnded ? <div className="sw-completion-actions"><button type="button" className="pf-button" disabled={isEnding} onClick={prepareNextLesson}>次のレッスンを準備</button></div>
            : lessonViewStarted ? <div className="sw-composer-area"><div className="sw-composer"><button type="button" className={`sw-icon ${isListening ? "active" : ""}`} disabled={!lessonActive || isSending || isEnding} onClick={toggleListening} aria-label={isListening ? "音声入力を停止" : "音声で入力"} aria-pressed={isListening}>{isListening ? "停止" : "音声"}</button><label className="sw-sr-only" htmlFor="sw-message">英語の回答</label><textarea id="sw-message" ref={inputRef} className="sw-textarea" value={input} disabled={!lessonActive || isEnding} onChange={(event) => setInput(event.target.value)} placeholder="英語で入力…" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage(); } }} /><button type="button" className="sw-send" disabled={!lessonActive || !input.trim() || isSending || isEnding} onClick={() => void sendMessage()}>送信</button></div><p className={`sw-composer-hint${isListening ? " is-listening" : ""}`}>{isListening ? "聞き取り中です。話し終えたら「停止」を選んでください。" : "Enterで送信 · Shift + Enterで改行"}</p></div> : null}
        </section>
      </div>
      {notice && !lessonViewStarted && <div className="sw-setup-notice" role="status">{notice}</div>}
    </main>
  );
}
