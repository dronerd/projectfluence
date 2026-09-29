import React, { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import AppBrand from "@/app/components/AppBrand";
import AuthButton from "@/app/components/AuthButton";
import { playVoiceResponse } from "../lib/voicePlayback";
import { boundedConversationHistory, makePromptMemory } from "../lib/promptMemory";
import { requestSignal } from "@/lib/browserRequest";

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
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);
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
  const sessionPromiseRef = useRef<Promise<string | null> | null>(null);
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
  const voiceAbortRef = useRef<AbortController | null>(null);
  const requestsRef = useRef(new Set<AbortController>());
  const turnStartedRef = useRef<number | null>(null);
  const recognitionStartedRef = useRef<number | null>(null);
  const preparedVoiceRef = useRef<{ text: string; voice: string } | null>(null);
  const operationRef = useRef(false);
  const savedSettingsRef = useRef("");
  const settingsSaveQueueRef = useRef(Promise.resolve());

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
      if (mounted) { setAccessToken(data.session?.access_token ?? null); setUserId(data.session?.user.id ?? null); setAuthReady(true); }
    }).catch(() => { if (mounted) setAuthReady(true); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token ?? null);
      setUserId(session?.user.id ?? null);
      setAuthReady(true);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [supabase]);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    const loadController = new AbortController();
    const deadline = requestSignal(15000, [loadController.signal]);
    savedSettingsRef.current = "";
    setSettingsHydrated(false);
    setSettingsLoaded(false);
    setMemory(null);
    setSettings(DEFAULT_SETTINGS);
    // A sign-out/account switch must not leave the previous learner's chat active.
    requestsRef.current.forEach((controller) => controller.abort());
    voiceAbortRef.current?.abort(); voiceRequestRef.current += 1;
    audioRef.current?.pause();
    const oldRecognition = recognitionRef.current; recognitionRef.current = null; oldRecognition?.stop();
    preparedVoiceRef.current = null;
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    setChatLog([]); setSummary(null); setSummarySaved(false); setLessonActive(false);
    setLessonStartedAt(null); setLessonEnded(false); setInput(""); setError("");
    setVoiceLoading(false); setIsListening(false); setOptionsOpen(true);
    if (!userId || !supabase) { deadline.dispose(); setSettingsLoaded(true); return; }
    // Reload only when identity changes, not on every access-token refresh.
    void supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) throw new Error("Missing session");
      const results = await Promise.allSettled([
        fetch("/api/speakwise/lesson-settings", { headers: { Authorization: `Bearer ${token}` }, signal: deadline.signal })
          .then(async (response) => { if (!response.ok) throw new Error(); return response.json(); })
          .then((data) => sanitizeSettings(data.settings)),
        fetch("/api/speakwise/learner-memory", { headers: { Authorization: `Bearer ${token}` }, signal: deadline.signal })
          .then(async (response) => { if (!response.ok) throw new Error(); return response.json(); }),
      ]);
      if (cancelled) return;
      const [storedSettings, storedMemory] = results;
      if (storedSettings.status === "fulfilled") {
        if (storedSettings.value) setSettings(storedSettings.value);
        savedSettingsRef.current = JSON.stringify(storedSettings.value ?? DEFAULT_SETTINGS);
        setSettingsHydrated(true);
      } else setNotice("前回の設定を読み込めませんでした。保存済み設定を守るため、この画面の変更は保存されません。");
      if (storedMemory.status === "fulfilled") setMemory(storedMemory.value);
      else setNotice("学習履歴を読み込めませんでした。現在の設定で練習できます。");
    }).catch(() => {
      if (!cancelled) setNotice("前回の設定を読み込めませんでした。接続を確認してください。");
    }).finally(() => { deadline.dispose(); if (!cancelled) setSettingsLoaded(true); });
    return () => { cancelled = true; loadController.abort(); deadline.dispose(); };
  }, [userId, authReady, supabase]);

  useEffect(() => {
    if (!settingsLoaded || !settingsHydrated || !accessToken) return;
    const snapshot = JSON.stringify(settings);
    if (savedSettingsRef.current === snapshot) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      // Serialize writes so a slower old preference cannot overwrite a newer one.
      settingsSaveQueueRef.current = settingsSaveQueueRef.current.then(async () => {
        if (cancelled) return;
        const deadline = requestSignal(15000);
        try {
          const response = await fetch("/api/speakwise/lesson-settings", {
            method: "PUT", signal: deadline.signal,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ settings }),
          });
          if (!response.ok) throw new Error("Settings save failed");
          if (!cancelled) savedSettingsRef.current = snapshot;
        } catch {
          if (!cancelled) setNotice("設定を保存できませんでした。この画面では引き続き練習できます。");
        } finally { deadline.dispose(); }
      });
    }, 600);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [accessToken, settings, settingsLoaded, settingsHydrated]);

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
    const oldRecognition = recognitionRef.current; recognitionRef.current = null; oldRecognition?.stop();
    audioRef.current?.pause();
    voiceRequestRef.current += 1;
    voiceAbortRef.current?.abort();
    requestsRef.current.forEach((controller) => controller.abort());
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

  async function authenticatedFetch(url: string, init: RequestInit, controller: AbortController) {
    // getSession refreshes an expiring token; never attach a stale state snapshot.
    const session = supabase ? (await supabase.auth.getSession()).data.session : null;
    if (!session?.access_token) throw new Error("SpeakWiseを利用するには、ログインしてください。");
    return fetch(url, { ...init, signal: controller.signal,
      headers: { ...init.headers, Authorization: `Bearer ${session.access_token}` } });
  }

  async function authenticatedJson<T>(url: string, init: RequestInit) {
    const controller = new AbortController();
    requestsRef.current.add(controller);
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await authenticatedFetch(url, init, controller);
      // Keep the deadline and unmount cancellation until the body has finished.
      const data = await response.json() as T;
      return { response, data };
    } finally { clearTimeout(timer); requestsRef.current.delete(controller); }
  }

  function requestError(status: number, fallback: string) {
    if (status === 401) return "ログインの有効期限が切れました。もう一度ログインしてください。";
    if (status === 429) return "リクエストが混み合っています。少し待ってから、もう一度お試しください。";
    return fallback;
  }

  async function callAgent(userText: string, phase: "start" | "continue" = "continue", mode = selectedMode.id, history = chatLog) {
    if (!SPEAKWISE_API_URL) throw new Error("レッスンに接続できません。しばらくしてから、もう一度お試しください。");
    const { response: res, data } = await authenticatedJson<{ reply?: string; error?: string }>(`${SPEAKWISE_API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "agent", lessonMode: mode, level: settings.level, topics,
        durationMinutes: settings.durationMinutes, elapsedSeconds: phase === "start" ? 0 : elapsedSeconds,
        phase, message: userText,
        history: boundedConversationHistory(history.slice(-12).map((entry) => ({ role: entry.sender, content: entry.text })), 48000),
        learnerMemory: makePromptMemory(memory), pdfContext: settings.pdfContext, voiceEnabled: settings.voiceEnabled,
      }),
    });
    if (!res.ok || data.error || typeof data.reply !== "string" || !data.reply.trim()) throw new Error(requestError(res.status, "返答を取得できませんでした。"));
    console.info("speakwise_timing", { stage: "reply_received", elapsedMs: turnStartedRef.current ? Math.round(performance.now() - turnStartedRef.current) : null, requestId: res.headers.get("x-request-id") });
    return String(data.reply).trim();
  }

  function appendAssistant(text: string) {
    setChatLog((prev) => [...prev, { sender: "assistant", text }]);
    if (settings.voiceEnabled) void playVoice(text);
  }

  async function startLesson(modeOverride?: LessonMode) {
    if (setupDisabled || !settingsLoaded || operationRef.current) return;
    if (!accessToken) { setError("SpeakWiseを利用するには、ログインしてください。"); return; }
    const nextMode = modeOverride || selectedMode.id;
    if (nextMode === "pdf_reading" && !settings.pdfContext.trim()) {
      setError("読解で使いたい英文を貼り付けるか、テキストファイルを選んでください。");
      return;
    }
    stopMedia();
    autoEndedRef.current = false;
    setSummary(null); setSummarySaved(false); setLessonEnded(false); setError(""); setRetryText(null);
    setOptionsOpen(false); setElapsedSeconds(0); setChatLog([]); setInput(""); sessionPromiseRef.current = null; currentSessionIdRef.current = crypto.randomUUID();
    updateSettings({ lessonMode: nextMode });
    const label = LESSON_MODES.find((item) => item.id === nextMode)?.label || "English practice";
    const startText = settings.directStart
      ? `Start the lesson naturally. The selected mode is ${label}. Open with a short greeting, then give the first task.`
      : `Greet me naturally with "How are you today?", then begin ${label} step by step.`;
    setIsSending(true); operationRef.current = true; turnStartedRef.current = performance.now();
    try {
      const reply = await callAgent(startText, "start", nextMode, []);
      setLessonStartedAt(Date.now()); setLessonActive(true);
      appendAssistant(reply);
      sessionPromiseRef.current = recordSessionStart(nextMode);
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (error) {
      setError(error instanceof Error ? error.message : "レッスンを開始できませんでした。接続を確認して、もう一度お試しください。");
      setLessonActive(false); setLessonStartedAt(null); setOptionsOpen(true);
    } finally { setIsSending(false); operationRef.current = false; }
  }

  async function recordSessionStart(lessonMode: LessonMode) {
    if (!accessToken) return null;
    try {
      const { response, data } = await authenticatedJson<{ session?: { id?: string } }>("/api/speakwise/lesson-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ sessionId: currentSessionIdRef.current, mode: lessonMode === "writing_feedback" ? "writing" : "speaking", lessonMode,
          level: settings.level, plannedDurationMinutes: settings.durationMinutes, selectedTopics: topics, selectedComponents: [lessonMode] }),
      });
      if (response.ok && typeof data?.session?.id === "string") return data.session.id as string;
    } catch { /* Conversation remains usable; the summary save reports the failure. */ }
    setNotice("学習履歴の準備に失敗しました。会話は続けられますが、保存時にもう一度接続を確認します。");
    return null;
  }

  async function sendMessage(retry = false) {
    const text = (retry ? retryText : input)?.trim();
    if (!text || !lessonActive || isSending || isEnding || operationRef.current) return;
    stopMedia();
    operationRef.current = true; turnStartedRef.current = performance.now();
    setInput(""); setError(""); setRetryText(null);
    if (!retry) setChatLog((prev) => [...prev, { sender: "user", text }]);
    setIsSending(true);
    try {
      const history = retry ? chatLog.slice(0, -1) : chatLog;
      appendAssistant(await callAgent(text, "continue", selectedMode.id, history));
    } catch (error) {
      setError(error instanceof Error ? error.message : "返答を取得できませんでした。回答は残っています。もう一度送信できます。");
      setRetryText(text);
    } finally { operationRef.current = false; setIsSending(false); requestAnimationFrame(() => inputRef.current?.focus()); }
  }

  async function endLesson() {
    if (isEnding || isSending || !chatLog.length || operationRef.current) return;
    operationRef.current = true;
    stopMedia(); setError(""); setRetryText(null); setIsEnding(true); setLessonActive(false); setLessonEnded(true);
    try {
      const { response: res, data } = await authenticatedJson<{ error?: string; summary?: LessonSummary }>(`${SPEAKWISE_API_URL}/api/lesson-summary`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonMode: selectedMode.id, level: settings.level, topics,
          durationMinutes: settings.durationMinutes, elapsedSeconds,
          history: boundedConversationHistory(chatLog.map((entry) => ({ role: entry.sender, content: entry.text }))) }),
      });
      if (!res.ok || data.error || !data.summary) throw new Error();
      const nextSummary = data.summary as LessonSummary;
      setSummary(nextSummary);
      setSummarySaved(await persistSummary(nextSummary));
    } catch {
      setError("レッスンは終了しました。振り返りを作成できませんでしたが、会話はこの画面に残っています。");
    } finally { setIsEnding(false); operationRef.current = false; }
  }

  async function persistSummary(nextSummary: LessonSummary) {
    if (!accessToken) return false;
    try {
      let sessionId = await sessionPromiseRef.current;
      if (!sessionId) {
        sessionPromiseRef.current = recordSessionStart(selectedMode.id);
        sessionId = await sessionPromiseRef.current;
      }
      if (!sessionId) throw new Error("Session could not be saved");
      const { response, data } = await authenticatedJson<{ error?: string; memory?: LearnerMemory }>("/api/speakwise/learner-memory", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ sessionId, lessonMode: selectedMode.id, level: settings.level,
          durationMinutes: settings.durationMinutes, elapsedSeconds, topics, summary: nextSummary }),
      });
      if (!response.ok || data.error) throw new Error();
      setMemory(data.memory ?? memory);
      return true;
    } catch {
      setNotice("振り返りは表示できましたが、学習履歴への保存に失敗しました。");
      return false;
    }
  }

  function stopMedia() {
    const oldRecognition = recognitionRef.current; recognitionRef.current = null; oldRecognition?.stop(); setIsListening(false);
    audioRef.current?.pause(); voiceAbortRef.current?.abort(); voiceRequestRef.current += 1; setVoiceLoading(false);
    preparedVoiceRef.current = null;
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
  }

  async function playVoice(text: string) {
    if (!text.trim()) return;
    if (!SPEAKWISE_API_URL) { setNotice("音声を再生できません。しばらくしてから、もう一度お試しください。"); return; }
    if (preparedVoiceRef.current?.text === text && preparedVoiceRef.current.voice === settings.selectedVoice && audioRef.current) {
      try { await audioRef.current.play(); setNotice(""); }
      catch { setNotice("音声を再生できませんでした。もう一度お試しください。"); }
      return;
    }
    stopMedia();
    const requestId = ++voiceRequestRef.current;
    const controller = new AbortController(); voiceAbortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 90000);
    const started = performance.now();
    setVoiceLoading(true);
    const audio = new Audio(); audioRef.current = audio;
    audio.preload = "auto";
    audio.onplaying = () => {
      if (requestId !== voiceRequestRef.current) return;
      console.info("speakwise_timing", { stage: "audio_playing", ttsToPlaybackMs: Math.round(performance.now() - started), turnToPlaybackMs: turnStartedRef.current ? Math.round(performance.now() - turnStartedRef.current) : null });
    };
    try {
      const res = await authenticatedFetch(`${SPEAKWISE_API_URL}/api/voice`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: settings.selectedVoice }),
      }, controller);
      if (!res.ok) throw new Error(requestError(res.status, "音声を再生できませんでした。もう一度お試しください。"));
      await playVoiceResponse(res, audio, controller.signal, (url) => {
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = url;
      }, () => setNotice("音声の準備ができました。返答の読み上げボタンを押して再生してください。"), () => {
        console.info("speakwise_timing", { stage: "audio_first_byte", elapsedMs: Math.round(performance.now() - started), requestId: res.headers.get("x-request-id") });
      });
      if (requestId !== voiceRequestRef.current) return;
      preparedVoiceRef.current = { text, voice: settings.selectedVoice };
audio.onerror = () => {
      if (requestId === voiceRequestRef.current) {
        setNotice("音声の読み込みに失敗しました。読み上げボタンで再試行できます。");
        preparedVoiceRef.current = null;
        controller.abort();
      }
    };
      audio.onended = () => {
        if (requestId !== voiceRequestRef.current || audioRef.current !== audio) return;
        preparedVoiceRef.current = null;
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      };
    } catch (error) {
      if (!controller.signal.aborted && requestId === voiceRequestRef.current) setNotice(error instanceof Error ? error.message : "音声を再生できませんでした。もう一度お試しください。");
      else if (requestId === voiceRequestRef.current && performance.now() - started >= 89000) setNotice("音声の読み込みに時間がかかっています。読み上げボタンで再試行できます。");
    } finally { clearTimeout(timer); if (requestId === voiceRequestRef.current) setVoiceLoading(false); }
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
    stopMedia();
    const recognition = new SpeechRecognition();
    recognitionStartedRef.current = performance.now();
    recognition.lang = "en-US"; recognition.interimResults = true; recognition.continuous = true;
    recognition.onstart = () => { if (recognitionRef.current === recognition) setIsListening(true); };
    recognition.onend = () => { if (recognitionRef.current !== recognition) return; setIsListening(false); recognitionRef.current = null; };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      setIsListening(false); recognitionRef.current = null;
      if (event.error !== "aborted") setNotice(event.error === "not-allowed"
        ? "マイクを使うには、ブラウザでマイクの使用を許可してください。文字入力でも練習できます。"
        : "音声を聞き取れませんでした。もう一度話すか、文字で入力してください。");
    };
    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition) return;
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) finalText += `${event.results[i][0].transcript} `;
      }
      if (finalText.trim()) console.info("speakwise_timing", { stage: "recognition_final", captureMs: recognitionStartedRef.current ? Math.round(performance.now() - recognitionStartedRef.current) : null });
      if (finalText.trim()) setInput((prev) => [prev, finalText.trim()].filter(Boolean).join(" "));
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch { recognitionRef.current = null; setNotice("マイクを開始できませんでした。文字入力で練習できます。"); }
  }

  async function handleTextFile(file: File | null) {
    if (!file) return;
    if (file.size > 256 * 1024) { setError("256KB以下のテキストファイルを選んでください。"); return; }
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
          {authReady && !accessToken && <div><p className="sw-note">SpeakWiseを利用するには、ログインしてください。</p><AuthButton compact hideWhenAuthenticated /></div>}
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
              <input id="sw-custom-topic" className="sw-input" value={settings.customTopic} maxLength={240} onChange={(event) => updateSettings({ customTopic: event.target.value })} placeholder="例：次の海外旅行" />
              <label className="sw-toggle"><input type="checkbox" checked={settings.directStart} onChange={(event) => updateSettings({ directStart: event.target.checked })} /><span>あいさつを短くして、練習から始める</span></label>
            </fieldset>
          </details>
          <details className="sw-details">
            <summary>音声の設定<span>{settings.voiceEnabled ? "自動再生オン" : "自動再生オフ"}</span></summary>
            <label className="sw-toggle"><input type="checkbox" checked={settings.voiceEnabled} onChange={(event) => updateSettings({ voiceEnabled: event.target.checked })} /><span>AIの返答を自動で読み上げる（AI生成音声）</span></label>
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
          {lessonEnded ? <div className="sw-completion-actions"><button type="button" className="pf-button" disabled={isEnding} onClick={prepareNextLesson}>次のレッスンを準備</button>{summary && !summarySaved && accessToken && <button type="button" className="pf-button pf-button-secondary" disabled={isEnding} onClick={() => { setIsEnding(true); void persistSummary(summary).then(setSummarySaved).finally(() => setIsEnding(false)); }}>振り返りの保存を再試行</button>}</div>
            : lessonViewStarted ? <div className="sw-composer-area"><div className="sw-composer"><button type="button" className={`sw-icon ${isListening ? "active" : ""}`} disabled={!lessonActive || isSending || isEnding} onClick={toggleListening} aria-label={isListening ? "音声入力を停止" : "音声で入力"} aria-pressed={isListening}>{isListening ? "停止" : "音声"}</button><label className="sw-sr-only" htmlFor="sw-message">英語の回答</label><textarea id="sw-message" ref={inputRef} className="sw-textarea" value={input} maxLength={8000} disabled={!lessonActive || isEnding} onChange={(event) => setInput(event.target.value)} placeholder="英語で入力…" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage(); } }} /><button type="button" className="sw-send" disabled={!lessonActive || !input.trim() || isSending || isEnding} onClick={() => void sendMessage()}>送信</button></div><p className={`sw-composer-hint${isListening ? " is-listening" : ""}`}>{isListening ? "聞き取り中です。話し終えたら「停止」を選んでください。" : "Enterで送信 · Shift + Enterで改行"}</p></div> : null}
        </section>
      </div>
      {notice && !lessonViewStarted && <div className="sw-setup-notice" role="status">{notice}</div>}
    </main>
  );
}
