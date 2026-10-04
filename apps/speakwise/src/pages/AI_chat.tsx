import React, { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import AppBrand from "@/app/components/AppBrand";
import AuthButton from "@/app/components/AuthButton";
import { playVoiceResponse } from "../lib/voicePlayback";
import { RealtimeConversation, type VoiceStatus, type VoiceTurn } from "../lib/realtimeConversation";
import LearningWorkspace, { type WorkspaceHandle } from "../components/LearningWorkspace";
import MemoryControls from "../components/MemoryControls";
import { MATERIAL_ACTION_LABELS, languageTag, jsonRequest, type MaterialKind, type LearningAction, type LearningContext, type LearningEvent, type LearningRequest, type SourceCitation, type SourceSelection } from "../lib/learning";
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
  id: string;
  sender: "user" | "assistant";
  citations?: SourceCitation[];
  inputMethod?: "typed" | "speech";
  requestContext?: LearningContext;
  action?: LearningAction;
  text: string;
  audioLoading?: boolean;
  transcriptPending?: boolean;
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
  status?: string;
  uncertainty?: string[];
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
  targetLanguage: string;
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
  { id: "pdf_reading", label: "PDF-Based Reading", labelJa: "PDF読解練習", short: "アップロードしたPDFをページ参照付きで読み、理解を深めます" },
  { id: "writing_feedback", label: "Writing & Feedback", labelJa: "ライティング添削", short: "短い文章を書き、文法・語彙・構成・自然さを改善します" },
  { id: "deep_discussion", label: "Deep Discussion", labelJa: "深いディスカッション", short: "抽象的・学術的な話題で、意見の組み立て方を練習します" },
  { id: "review_weakness", label: "Review & Weakness", labelJa: "苦手を復習", short: "過去のミスや苦手分野をもとに、必要な練習を集中して行います" },
];

const DEFAULT_SETTINGS: SpeakWiseSettings = {
  targetLanguage: "en",
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

const VOICES = ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"];

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
    targetLanguage: "en",
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [source, setSource] = useState<SourceSelection>({});
  const selectedSourceRef = useRef<SourceSelection>({});
  const practiceRef = useRef<{ cardId: string; attemptId: string } | null>(null);
  const [practice, setPractice] = useState<{ cardId: string; attemptId: string } | null>(null);
  const [sessionEvents, setSessionEvents] = useState<LearningEvent[]>([]);
  const memoryResetRef = useRef(false);
  const [workspaceGeneration, setWorkspaceGeneration] = useState(0);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const workspaceRef = useRef<WorkspaceHandle>(null);
  const workspaceHeadingRef = useRef<HTMLHeadingElement>(null);
  const workspaceToggleRef = useRef<HTMLButtonElement>(null);
  const workspaceReturnRef = useRef<HTMLElement | null>(null);
  const [materialBusy, setMaterialBusy] = useState(false);
  const wasWorkspaceOpenRef = useRef(false);
  const stickToBottomRef = useRef(true);
  const turnIdRef = useRef<string | null>(null);
  const startRequestRef = useRef<{ sessionId: string; requestId: string; message: string; context: LearningContext; settings: SpeakWiseSettings; source: SourceSelection } | null>(null);
  const stateQueueRef = useRef(Promise.resolve());
  const [settings, setSettings] = useState<SpeakWiseSettings>(DEFAULT_SETTINGS);
  const targetLanguage = "en";
  const [memory, setMemory] = useState<LearnerMemory | null>(null);
  const [chatLog, setChatLog] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const inputMethodRef = useRef<"typed" | "speech">("typed");
  const [pendingDescription, setPendingDescription] = useState("");
  const [lessonActive, setLessonActive] = useState(false);
  const [lessonStartedAt, setLessonStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [summary, setSummary] = useState<LessonSummary | null>(null);
  const [lessonEnded, setLessonEnded] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(true);
  const sessionPromiseRef = useRef<Promise<string | null> | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("closed");
  const [micMuted, setMicMuted] = useState(false);
  const [livePlaybackBlocked, setLivePlaybackBlocked] = useState(false);
  const realtimeRef = useRef<RealtimeConversation | null>(null);
  const voiceDisconnectRef = useRef<Promise<unknown>>(Promise.resolve());
  const liveAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingVoiceTurnsRef = useRef(new Map<string, VoiceTurn>());
  const voiceSaveQueueRef = useRef(Promise.resolve());
  const voiceTurnHandlerRef = useRef<(turn: VoiceTurn) => void>(() => {});
  const voiceActive = voiceStatus !== "closed";
  const voiceBusy = voiceStatus === "connecting" || voiceStatus === "thinking" || voiceStatus === "speaking";
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [summarySaved, setSummarySaved] = useState(false);
  const [retryText, setRetryText] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const [audioVisible, setAudioVisible] = useState(false);
  const audioUrlRef = useRef<string | null>(null);
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
    const oldVoice = realtimeRef.current; realtimeRef.current = null; oldVoice?.close();
    pendingVoiceTurnsRef.current.clear();
    preparedVoiceRef.current = null;
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    currentSessionIdRef.current = null; startRequestRef.current = null; setSessionId(null); setSource({}); selectedSourceRef.current = {}; practiceRef.current = null; setPractice(null); setSessionEvents([]); setWorkspaceOpen(false); setMaterialBusy(false);
    setChatLog([]); setSummary(null); setSummarySaved(false); setLessonActive(false);
    setLessonStartedAt(null); setLessonEnded(false); setInput(""); setError("");
    setVoiceLoading(false); setVoiceStatus("closed"); setMicMuted(false); setOptionsOpen(true);
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
      try {
        const response = await fetch("/api/speakwise/lesson-sessions", { headers: { Authorization: `Bearer ${token}` }, signal: deadline.signal });
        if (!response.ok) throw new Error();
        const saved = await response.json();
        if (!cancelled && saved.session?.id) {
          const row = saved.session;
          const state = row.state || {};
          currentSessionIdRef.current = row.id; setSessionId(row.id);
          sessionPromiseRef.current = Promise.resolve(row.id);
          const restored = sanitizeSettings(state.settings);
          if (restored) setSettings(restored);
          else setSettings(previous => ({ ...previous, level: isLevel(row.level) ? row.level : previous.level, lessonMode: isLessonMode(row.lesson_mode) ? row.lesson_mode : previous.lessonMode }));
          const restoredSource = { documentId: state.documentId || undefined, contentId: state.contentId || undefined, contentType: state.contentType || undefined, scriptId: state.scriptId || undefined, title: state.materialTitle || undefined, kind: state.materialKind || undefined };
          selectedSourceRef.current = restoredSource; setSource(restoredSource);
          const restoredPractice = state.cardId && state.practiceAttemptId ? { cardId: state.cardId, attemptId: state.practiceAttemptId } : null;
          practiceRef.current = restoredPractice; setPractice(restoredPractice);
          setSessionEvents((saved.events || []).map((event: { id: string; event_type: string; payload: Record<string, unknown> }) => ({ id: event.id, type: event.event_type, payload: event.payload })));
          const lastMessage = saved.messages?.at(-1);
          if (lastMessage?.role === "user") { turnIdRef.current = lastMessage.id; setRetryText(lastMessage.content); setError("保存した回答への返答が未確認です。「もう一度送信」で続けられます。"); }
          setChatLog((saved.messages || []).map((message: { id: string; role: "user" | "assistant"; content: string; metadata?: { citations?: SourceCitation[]; inputMethod?: "typed" | "speech"; requestContext?: LearningContext; action?: LearningAction } }) => ({ id: message.id, sender: message.role, text: message.content, citations: message.metadata?.citations, inputMethod: message.metadata?.inputMethod, requestContext: message.metadata?.requestContext, action: message.metadata?.action })));
          const elapsed = Number(row.elapsed_seconds || state.elapsedSeconds || 0);
          setElapsedSeconds(elapsed);
          if (saved.messages?.length) { setLessonStartedAt(Date.now() - elapsed * 1000); setLessonActive(true); setOptionsOpen(false); }
          else { setLessonStartedAt(null); setLessonActive(false); setOptionsOpen(true); }
          setLessonEnded(false);
          setNotice("保存したレッスンを再開しました。休止中の時間は学習時間に含めていません。");
        }
      } catch { if (!cancelled) setNotice("中断したレッスンを確認できませんでした。接続を確認して再読み込みできます。"); }
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
    if (!lessonActive || isSending || isEnding || materialBusy || autoEndedRef.current || elapsedSeconds < totalSeconds || chatLog.length < 2) return;
    autoEndedRef.current = true;
    void endLessonRef.current?.();
  }, [chatLog.length, elapsedSeconds, lessonActive, totalSeconds, isSending, isEnding, materialBusy]);

  useEffect(() => {
    const container = chatEndRef.current?.parentElement;
    if (container && stickToBottomRef.current) container.scrollTop = container.scrollHeight;
  }, [chatLog, isSending, summary, error]);

  useEffect(() => {
    if (workspaceOpen && !wasWorkspaceOpenRef.current) workspaceHeadingRef.current?.focus({ preventScroll: true });
    if (!workspaceOpen && wasWorkspaceOpenRef.current) {
      const control = workspaceReturnRef.current;
      (control?.isConnected ? control : workspaceToggleRef.current)?.focus({ preventScroll: true });
    }
    wasWorkspaceOpenRef.current = workspaceOpen;
    // Only a deliberate pane transition changes focus, never autosave or new content.
  }, [workspaceOpen]);

  useEffect(() => () => {
    const oldVoice = realtimeRef.current; realtimeRef.current = null; oldVoice?.close();
    pendingVoiceTurnsRef.current.clear();
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

  function openMaterials(kind?: MaterialKind) {
    workspaceReturnRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : workspaceToggleRef.current;
    setOptionsOpen(false); setWorkspaceOpen(true);
    workspaceRef.current?.open(kind);
  }

  function closeMaterials() {
    workspaceRef.current?.cancel();
    setWorkspaceOpen(false);
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

  async function authenticatedJson<T>(url: string, init: RequestInit, timeoutMs = 60000) {
    const controller = new AbortController();
    requestsRef.current.add(controller);
    const cancel = () => controller.abort();
    if (init.signal?.aborted) controller.abort();
    else init.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, timeoutMs);
    try {
      const response = await authenticatedFetch(url, init, controller);
      // Keep the deadline and unmount cancellation until the body has finished.
      const data = await response.json() as T;
      return { response, data };
    } finally { clearTimeout(timer); init.signal?.removeEventListener("abort", cancel); requestsRef.current.delete(controller); }
  }

  function requestError(status: number, fallback: string) {
    if (status === 401) return "ログインの有効期限が切れました。もう一度ログインしてください。";
    if (status === 429) return "リクエストが混み合っています。少し待ってから、もう一度お試しください。";
    return fallback;
  }

  const learningRequest: LearningRequest = async <T,>(path: string, init: RequestInit = {}, service: "python" | "next" = "next") => {
    if (service === "python" && !SPEAKWISE_API_URL) throw new Error("レッスンサービスに接続できません。サービスの設定を確認してください。");
    const { response, data } = await authenticatedJson<T & { error?: string; detail?: string }>(service === "python" ? `${SPEAKWISE_API_URL}${path}` : path, init, path === "/api/learning/chat" ? 180000 : path === "/api/learning/script" ? 90000 : 60000);
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : typeof data.detail === "string" ? data.detail : requestError(response.status, "処理に失敗しました。接続を確認して再試行してください。"));
    return data;
  };

  async function saveLessonState(messages: Array<{ id: string; role: "user" | "assistant"; content: string; metadata?: { inputMethod: "typed" | "speech"; requestContext?: LearningContext } }> = [], events: LearningEvent[] = [], override?: { settings: SpeakWiseSettings; targetLanguage: string }) {
    if (memoryResetRef.current) throw new Error("メモリーを更新中です。完了してから新しいレッスンを開始してください。");
    const id = currentSessionIdRef.current;
    if (!id) throw new Error("先にレッスンを開始してください。");
    setSaveStatus("保存中…");
    try {
      const selected = selectedSourceRef.current;
      const snapshot = { sessionId: id, messages, events, state: { documentId: selected.documentId ?? null, contentId: selected.contentId ?? null, contentType: selected.contentType ?? null, cardId: practiceRef.current?.cardId ?? null, practiceAttemptId: practiceRef.current?.attemptId ?? null, scriptId: selected.scriptId ?? null, materialTitle: selected.title ?? null, materialKind: selected.kind ?? null, settings: override?.settings || settings, targetLanguage: override?.targetLanguage || targetLanguage, elapsedSeconds }, elapsedSeconds };
      const write = stateQueueRef.current.then(() => learningRequest("/api/speakwise/lesson-sessions", jsonRequest(snapshot, "PATCH")));
      stateQueueRef.current = write.then(() => undefined, () => undefined);
      await write;
      setSaveStatus(pendingVoiceTurnsRef.current.size && !messages.length ? "未保存・再試行が必要" : "保存済み");
      if (events.length) setSessionEvents(previous => [...previous, ...events.filter(event => !previous.some(saved => saved.id === event.id))]);
    } catch (cause) { setSaveStatus("未保存・再試行が必要"); throw cause; }
  }

  function changeSource(next: SourceSelection) {
    stopRealtime();
    selectedSourceRef.current = next; setSource(next);
    const materialNotice = next.documentId || next.scriptId || next.contentId ? "教材を選びました。このまま同じレッスンで質問・練習できます。" : "教材の選択を解除しました。会話はそのまま続けられます。";
    setNotice(materialNotice + (voiceActive ? " 音声は「音声で会話する」から続けられます。" : ""));
    if (currentSessionIdRef.current) void saveLessonState().catch(() => setNotice("教材の選択を保存できませんでした。保存を再試行してください。"));
  }

  function changePractice(next: { cardId: string; attemptId: string }) {
    practiceRef.current = next; setPractice(next);
    if (currentSessionIdRef.current) void saveLessonState().catch(() => setNotice("単語練習の状態を保存できませんでした。保存を再試行してください。"));
  }

  async function refreshMemory() {
    try { setMemory(await learningRequest<LearnerMemory>("/api/speakwise/learner-memory")); } catch { setNotice("学習メモリーを更新できませんでした。"); }
  }

  function lessonRequestContext(): LearningContext {
    const selected = selectedSourceRef.current;
    return { documentId: selected.documentId, contentId: selected.contentId, scriptId: selected.scriptId, level: settings.level, targetLanguage, lessonMode: selectedMode.id, topics };
  }

  async function callAgent(userText: string, context = lessonRequestContext()) {
    setPendingDescription(source.documentId && /全体|すべて|全文|whole|entire|summari[sz]e.*(?:PDF|document)/i.test(userText) ? "PDF全体のページを確認しています。長い文書では数分かかることがあります…" : "返答を考えています…");
    const data = await learningRequest<{ reply: string; messageId: string; citations?: SourceCitation[]; action?: LearningAction; requestContext?: LearningContext }>("/api/learning/chat", jsonRequest({
      sessionId: currentSessionIdRef.current, requestId: turnIdRef.current || crypto.randomUUID(), message: userText,
      ...context,
    }), "python");
    if (typeof data.reply !== "string" || !data.reply.trim() || !data.messageId) throw new Error("返答を取得・保存できませんでした。もう一度送信してください。");
    return { ...data, requestContext: data.requestContext || context };
  }

  async function appendAssistant(data: { reply: string; messageId: string; citations?: SourceCitation[]; action?: LearningAction; requestContext?: LearningContext }) {
    setChatLog(previous => previous.some(entry => entry.id === data.messageId) ? previous : [...previous, { id: data.messageId, sender: "assistant", text: data.reply, citations: data.citations, action: data.action, requestContext: data.requestContext }]);
    if (settings.voiceEnabled) void playVoice(data.reply);
    if (data.action && data.action.type !== "open_materials") {
      openMaterials();
      // The workspace stays mounted so actions can run even when its panel is closed.
      await workspaceRef.current?.execute(data.action, { requestId: data.messageId, context: data.requestContext || lessonRequestContext() });
    }
  }

  async function startLesson(modeOverride?: LessonMode) {
    if (setupDisabled || !settingsLoaded || operationRef.current) return;
    memoryResetRef.current = false;
    if (!accessToken) { setError("SpeakWiseを利用するには、ログインしてください。"); return; }
    const nextMode = modeOverride || selectedMode.id;
    stopMedia();
    autoEndedRef.current = false;
    setSummary(null); setSummarySaved(false); setLessonEnded(false); setError(""); setRetryText(null);
    setOptionsOpen(false); setElapsedSeconds(0); setChatLog([]); setInput(""); sessionPromiseRef.current = null; currentSessionIdRef.current ||= crypto.randomUUID(); setSessionId(currentSessionIdRef.current);
    updateSettings({ lessonMode: nextMode });
    const label = LESSON_MODES.find((item) => item.id === nextMode)?.label || "English practice";
    const proposedStartText = settings.directStart
      ? `Start the lesson naturally. The selected mode is ${label}. Open with a short greeting, then give the first task.`
      : `Greet me naturally with "How are you today?", then begin ${label} step by step.`;
    const pendingStart = startRequestRef.current?.sessionId === currentSessionIdRef.current ? startRequestRef.current : null;
    const startRequest = pendingStart || { sessionId: currentSessionIdRef.current!, requestId: crypto.randomUUID(), message: proposedStartText,
      context: { ...lessonRequestContext(), lessonMode: nextMode }, settings: { ...settings, lessonMode: nextMode }, source: { ...source } };
    startRequestRef.current = startRequest; turnIdRef.current = startRequest.requestId;
    // A dropped welcome response must replay exactly its original request, even
    // if the setup controls were changed while recovering the connection.
    if (pendingStart) {
      setSettings({ ...startRequest.settings, targetLanguage: "en" });
      selectedSourceRef.current = startRequest.source; setSource(startRequest.source);
      setNotice("前回の開始リクエストを同じ設定で再開しています。開始後に教材を切り替えられます。");
    }
    setIsSending(true); operationRef.current = true; turnStartedRef.current = performance.now();
    try {
      sessionPromiseRef.current = recordSessionStart(startRequest.settings.lessonMode as LessonMode, startRequest.settings, startRequest.context.topics);
      if (!await sessionPromiseRef.current) throw new Error("レッスンを保存できませんでした。接続を確認してください。");
      await saveLessonState([], [], { settings: startRequest.settings, targetLanguage: startRequest.context.targetLanguage });
      const reply = await callAgent(startRequest.message, startRequest.context);
      setLessonStartedAt(Date.now()); setLessonActive(true);
      await appendAssistant(reply);
      startRequestRef.current = null;
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (error) {
      setError(error instanceof Error ? error.message : "レッスンを開始できませんでした。接続を確認して、もう一度お試しください。");
      setLessonActive(false); setLessonStartedAt(null); setOptionsOpen(true);
    } finally { setIsSending(false); operationRef.current = false; }
  }

  async function recordSessionStart(lessonMode: LessonMode, sessionSettings = settings, sessionTopics = topics) {
    if (!accessToken) return null;
    try {
      const { response, data } = await authenticatedJson<{ session?: { id?: string } }>("/api/speakwise/lesson-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ sessionId: currentSessionIdRef.current, mode: lessonMode === "writing_feedback" ? "writing" : "speaking", lessonMode,
          level: sessionSettings.level, plannedDurationMinutes: sessionSettings.durationMinutes, selectedTopics: sessionTopics, selectedComponents: [lessonMode] }),
      });
      if (response.ok && typeof data?.session?.id === "string") return data.session.id as string;
    } catch { /* Conversation remains usable; the summary save reports the failure. */ }
    setNotice("学習履歴の準備に失敗しました。会話は続けられますが、保存時にもう一度接続を確認します。");
    return null;
  }

  async function sendMessage(retry = false, requestedText?: string) {
    const text = (requestedText || (retry ? retryText : input))?.trim();
    if (!text || !lessonActive || isSending || isEnding || operationRef.current) return;
    if (voiceActive && !retry && !requestedText) {
      if (voiceBusy) return;
      const entry: ChatEntry = { id: crypto.randomUUID(), sender: "user", text, inputMethod: "typed", requestContext: lessonRequestContext() };
      operationRef.current = true; setIsSending(true); setError("");
      // Pause capture during the storage write to avoid overlapping a spoken turn.
      const call = realtimeRef.current;
      call?.setMuted(true);
      try {
        await flushVoiceTurns();
        await saveLessonState([{ id: entry.id, role: "user", content: text, metadata: { inputMethod: "typed", requestContext: entry.requestContext } }]);
        setChatLog(previous => [...previous, entry]); setInput("");
        call?.sendText(text, entry.id);
        if (!call || realtimeRef.current !== call) throw new Error("音声接続が切れました。保存した回答をもう一度送信できます。");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "送信できませんでした。"); setRetryText(text); turnIdRef.current = entry.id;
        stopRealtime();
      } finally { call?.setMuted(micMuted); operationRef.current = false; setIsSending(false); }
      return;
    }
    stopMedia();
    operationRef.current = true; turnStartedRef.current = performance.now(); stickToBottomRef.current = true;
    setInput(""); setError(""); setRetryText(null);
    const prior = retry ? [...chatLog].reverse().find(entry => entry.sender === "user" && entry.text === text) : undefined;
    const entry: ChatEntry = prior || { id: crypto.randomUUID(), sender: "user", text, inputMethod: requestedText ? "typed" : inputMethodRef.current, requestContext: lessonRequestContext() };
    turnIdRef.current = entry.id;
    if (!retry) { setChatLog(previous => [...previous, entry]); }
    setIsSending(true);
    try {
      await flushVoiceTurns();
      await saveLessonState([{ id: entry.id, role: "user", content: text, metadata: { inputMethod: entry.inputMethod || "typed", requestContext: entry.requestContext || lessonRequestContext() } }]);
      inputMethodRef.current = "typed";
      await appendAssistant(await callAgent(text, entry.requestContext || lessonRequestContext()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "返答を取得できませんでした。回答は残っています。もう一度送信できます。");
      setRetryText(text);
    } finally { operationRef.current = false; setIsSending(false); }
  }

  async function endLesson() {
    if (isEnding || isSending || materialBusy || !chatLog.length || operationRef.current) return;
    operationRef.current = true;
    stopMedia(); setError(""); setRetryText(null); setIsEnding(true); setLessonActive(false); setLessonEnded(true);
    try {
      await flushVoiceTurns();
      await saveLessonState();
      const data = await learningRequest<{ summary: LessonSummary }>("/api/speakwise/lesson-sessions", jsonRequest({ action: "complete", sessionId: currentSessionIdRef.current }));
      setSummary(data.summary); setSummarySaved(true); void refreshMemory();
    } catch (cause) {
      setError(cause instanceof Error ? `振り返りを完了できませんでした: ${cause.message}` : "振り返りを完了できませんでした。保存したレッスンから再試行できます。");
    } finally { setIsEnding(false); operationRef.current = false; }
  }

  async function persistSummary() {
    await endLesson();
    return summarySaved;
  }

  async function prepareMemoryReset() {
    memoryResetRef.current = true;
    setLessonActive(false); stopMedia();
    requestsRef.current.forEach(controller => controller.abort());
    await stateQueueRef.current;
    setIsSending(false); setIsEnding(false); operationRef.current = false;
    prepareNextLesson();
  }

  function stopMedia() {
    setAudioVisible(false);
    stopRealtime();
    audioRef.current?.pause(); voiceAbortRef.current?.abort(); voiceRequestRef.current += 1; setVoiceLoading(false);
    preparedVoiceRef.current = null;
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
  }

  async function playVoice(text: string) {
    if (!text.trim()) return;
    if (text.length > 4096) { setNotice("この文章は音声の上限を超えています。教材パネルでは部分を選んで読み上げられます。"); return; }
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
    const audio = audioElementRef.current || new Audio(); audioRef.current = audio; setAudioVisible(true);
    audio.preload = "auto";
    audio.onplaying = () => {
      if (requestId !== voiceRequestRef.current) return;
      console.info("speakwise_timing", { stage: "audio_playing", readAloudToPlaybackMs: Math.round(performance.now() - started), turnToPlaybackMs: turnStartedRef.current ? Math.round(performance.now() - turnStartedRef.current) : null });
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
      // Keep completed audio available for native replay/seek. stopMedia, a new
      // utterance, identity changes, and unmount each revoke the previous URL.
      audio.onended = () => {
        if (requestId !== voiceRequestRef.current || audioRef.current !== audio) return;
        preparedVoiceRef.current = { text, voice: settings.selectedVoice };
      };
    } catch (error) {
      if (!controller.signal.aborted && requestId === voiceRequestRef.current) setNotice(error instanceof Error ? error.message : "音声を再生できませんでした。もう一度お試しください。");
      else if (requestId === voiceRequestRef.current && performance.now() - started >= 89000) setNotice("音声の読み込みに時間がかかっています。読み上げボタンで再試行できます。");
    } finally { clearTimeout(timer); if (requestId === voiceRequestRef.current) setVoiceLoading(false); }
  }

  function stopRealtime() {
    realtimeRef.current?.close();
    realtimeRef.current = null;
    setVoiceStatus("closed"); setMicMuted(false);
  }

  async function flushVoiceTurns() {
    const session = currentSessionIdRef.current;
    const write = voiceSaveQueueRef.current.then(async () => {
      if (currentSessionIdRef.current !== session) return;
      for (const turn of pendingVoiceTurnsRef.current.values()) {
        if (!turn.final) break; // Recognition may finish after the AI transcript.
        if (turn.text.trim()) {
          // Separate transactions preserve created_at order on lesson reload.
          await saveLessonState([{ id: turn.id, role: turn.role, content: turn.text,
            metadata: { inputMethod: turn.inputMethod, requestContext: lessonRequestContext() } }]);
        }
        pendingVoiceTurnsRef.current.delete(turn.id);
      }
    });
    voiceSaveQueueRef.current = write.catch(() => {});
    return write;
  }

  voiceTurnHandlerRef.current = turn => {
    if (!currentSessionIdRef.current || memoryResetRef.current) return;
    pendingVoiceTurnsRef.current.set(turn.id, turn);
    setChatLog(previous => {
      const entry = { id: turn.id, sender: turn.role, text: turn.text || "文字起こし中…", inputMethod: turn.inputMethod, transcriptPending: !turn.final };
      if (turn.final && !turn.text.trim()) return previous.filter(item => item.id !== turn.id);
      return previous.some(item => item.id === turn.id) ? previous.map(item => item.id === turn.id ? entry : item) : [...previous, entry];
    });
    if (turn.final) {
      if (!turn.text.trim()) pendingVoiceTurnsRef.current.delete(turn.id);
      void flushVoiceTurns().catch(() => {
        setNotice("音声の会話を保存できませんでした。「保存を再試行」で再保存できます。");
        stopRealtime();
      });
    }
  };

  async function startRealtime() {
    if (!lessonActive || isSending || isEnding || operationRef.current || realtimeRef.current) return;
    if (!SPEAKWISE_API_URL || !liveAudioRef.current) { setNotice("音声サービスに接続できません。文字入力で続けられます。"); return; }
    stopMedia(); setNotice(""); setError(""); setLivePlaybackBlocked(false);
    const call = new RealtimeConversation({
      audio: liveAudioRef.current,
      connect: async (sdp, signal) => {
        await voiceDisconnectRef.current;
        await flushVoiceTurns();
        await stateQueueRef.current;
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) controller.abort();
        try {
          const response = await authenticatedFetch(`${SPEAKWISE_API_URL}/api/realtime/calls`, jsonRequest({
            sessionId: currentSessionIdRef.current, sdp, voice: settings.selectedVoice, targetLanguage,
          }), controller);
          const data = await response.json();
          if (!response.ok) throw new Error(requestError(response.status, data.error || "音声会話に接続できませんでした。"));
          return data;
        } finally { signal.removeEventListener("abort", abort); }
      },
      disconnect: callId => {
        const closing = learningRequest(`/api/realtime/calls/${encodeURIComponent(callId)}`, { method: "DELETE" }, "python");
        voiceDisconnectRef.current = closing.catch(() => undefined);
        return closing;
      },
      onStatus: status => { if (realtimeRef.current === call) { setVoiceStatus(status); if (status === "closed") realtimeRef.current = null; } },
      onTurn: turn => { if (realtimeRef.current === call) voiceTurnHandlerRef.current(turn); },
      onError: message => { if (realtimeRef.current === call) setNotice(message); },
      onPlaybackBlocked: () => {
        if (realtimeRef.current !== call) return;
        setLivePlaybackBlocked(true);
        setNotice("音声を再生するには「AI音声を再生」を押してください。");
      },
    });
    realtimeRef.current = call;
    await call.start();
  }

  function prepareNextLesson() {
    setWorkspaceGeneration(value => value + 1); setWorkspaceOpen(false);
    stopMedia(); pendingVoiceTurnsRef.current.clear(); setOptionsOpen(true); setLessonEnded(false); setSummary(null); setChatLog([]); setSource({}); selectedSourceRef.current = {}; practiceRef.current = null; setPractice(null); setSessionEvents([]);
    currentSessionIdRef.current = null; startRequestRef.current = null; setSessionId(null); sessionPromiseRef.current = null; setSaveStatus("");
    setLessonStartedAt(null); setElapsedSeconds(0); setInput(""); setError(""); setRetryText(null);
    requestAnimationFrame(() => settingsRef.current?.focus());
  }

  useEffect(() => {
    if (!sessionId || !lessonActive || !accessToken) return;
    const snapshot = { sessionId, state: { documentId: source.documentId ?? null, contentId: source.contentId ?? null, contentType: source.contentType ?? null, cardId: practiceRef.current?.cardId ?? null, practiceAttemptId: practiceRef.current?.attemptId ?? null, scriptId: source.scriptId ?? null, materialTitle: source.title ?? null, materialKind: source.kind ?? null, settings, targetLanguage }, elapsedSeconds };
    const timer = window.setTimeout(() => {
      stateQueueRef.current = stateQueueRef.current.then(async () => {
        const deadline = requestSignal(15000);
        try {
          if (memoryResetRef.current) return;
          const current = selectedSourceRef.current;
          snapshot.state = { ...snapshot.state, documentId: current.documentId ?? null, contentId: current.contentId ?? null, contentType: current.contentType ?? null, scriptId: current.scriptId ?? null, materialTitle: current.title ?? null, materialKind: current.kind ?? null };
          const response = await fetch("/api/speakwise/lesson-sessions", { ...jsonRequest(snapshot, "PATCH"), headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, signal: deadline.signal });
          if (!response.ok) throw new Error();
          setSaveStatus(pendingVoiceTurnsRef.current.size ? "未保存・再試行が必要" : "保存済み");
        } catch { setSaveStatus("未保存・再試行が必要"); }
        finally { deadline.dispose(); }
      });
    }, 600);
    return () => window.clearTimeout(timer);
  // Save every ten seconds as well as source/settings transitions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, lessonActive, accessToken, source, settings, targetLanguage, Math.floor(elapsedSeconds / 10)]);

  useEffect(() => { endLessonRef.current = endLesson; });

  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;

  return (
    <main id="main-content" className={`sw-page${audioVisible ? " has-audio" : ""}`}>
      <div className={`sw-shell ${lessonViewStarted ? "lesson-started" : "pre-lesson"} ${optionsOpen ? "options-open" : "options-closed"} ${workspaceOpen ? "tools-open" : ""}`}>
        <aside id="sw-settings" className="sw-panel" ref={settingsRef} tabIndex={-1} aria-labelledby="sw-settings-title">
          <div className="sw-panel-head">
            <div><AppBrand app="speakwise" compact className="sw-setup-brand" /><h1 id="sw-settings-title">今日の英語レッスン</h1></div>
            {lessonViewStarted && <button type="button" className="sw-panel-close" onClick={closeSettings}>会話に戻る</button>}
          </div>
          {authReady && !accessToken && <div><p className="sw-note">SpeakWiseを利用するには、ログインしてください。</p><AuthButton compact hideWhenAuthenticated /></div>}
          {!settingsLoaded && <p className="sw-note" role="status">前回の設定を読み込んでいます…</p>}
          {error && !lessonViewStarted && <p className="sw-alert" role="alert">{error}</p>}
          <fieldset className="sw-settings-fields" disabled={setupDisabled || !settingsLoaded}>
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
          </fieldset>
          <p className="sw-note">教材はレッスン中にいつでも追加できます。</p>
          <div className="sw-start-area">
            {lessonActive ? <><p className="sw-note">レッスン中も教材の切り替えと音声設定を変更できます。</p><button className="pf-button pf-button-secondary sw-wide" disabled={isSending || isEnding || materialBusy} onClick={() => void endLesson()}>終了して振り返る</button></>
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
            <select id="sw-voice" className="sw-select" disabled={voiceActive} value={settings.selectedVoice} onChange={(event) => updateSettings({ selectedVoice: event.target.value })}>{VOICES.map((voice) => <option key={voice} value={voice}>{voice.charAt(0).toUpperCase() + voice.slice(1)}</option>)}</select>
            {voiceActive && <p className="sw-note">声を変更するには音声会話を終了してください。</p>}
          </details>
          <details className="sw-details">
            <summary>これまでの学習</summary>
            <p className="sw-memory">{accessToken ? summarizeMemory(memory) : "ログインすると、レッスンの振り返りや学習履歴を次の練習に活かせます。"}</p>
            {accessToken && <MemoryControls key={userId} request={learningRequest} onChanged={() => void refreshMemory()} onBeforeReset={prepareMemoryReset} />}
            <a className="sw-text-link" href="/analytics">学習記録を見る →</a>
          </details>
        </aside>

        <div id="sw-learning-tools" role="region" aria-labelledby="sw-materials-title" className={`sw-learning-tools${workspaceOpen ? " is-open" : ""}`} hidden={!workspaceOpen} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); closeMaterials(); } }}>
          <div className="sw-tools-heading"><h2 id="sw-materials-title" ref={workspaceHeadingRef} tabIndex={-1}>レッスン教材</h2><button className="sw-topic" onClick={closeMaterials}>会話に戻る</button></div>
          <LearningWorkspace key={`${userId || "guest"}:${workspaceGeneration}`} ref={workspaceRef} active={lessonActive} locked={isSending || isEnding} onBusy={setMaterialBusy} request={learningRequest} authenticated={Boolean(accessToken)} sessionId={sessionId} level={settings.level} targetLanguage={targetLanguage} source={source} events={sessionEvents} practice={practice} onPractice={changePractice} onSource={changeSource} onAsk={text => { closeMaterials(); setOptionsOpen(false); if (lessonActive) void sendMessage(false, text); else { setInput(text); setNotice("教材を選びました。レッスンを開始すると質問できます。"); } }} onListen={text => void playVoice(text)} onStopAudio={stopMedia} voiceLoading={voiceLoading} recordEvent={async event => { await saveLessonState([], [event]); }} onActivity={() => void refreshMemory()} />
        </div>
        <section className="sw-chat" aria-label="英語レッスン">
          <header className="sw-chat-head">
            <div className="sw-chat-heading"><h2>{selectedMode.labelJa}</h2><div className="sw-status"><span>{settings.level} · {LEVEL_LABELS[settings.level]}</span><span>{lessonActive ? `残り ${formatTime(remainingSeconds)}` : lessonEnded ? `${formatTime(elapsedSeconds)} 練習` : `${settings.durationMinutes}分のレッスン`}</span></div></div>
            <div className="sw-chat-controls">{lessonActive && <button ref={workspaceToggleRef} className="sw-end sw-add-materials" aria-controls="sw-learning-tools" aria-expanded={workspaceOpen} onClick={() => workspaceOpen ? closeMaterials() : openMaterials()}>＋ 教材を追加<span lang="en">Add materials</span></button>}<button type="button" ref={settingsToggleRef} className="sw-chat-menu" onClick={showSettings} aria-controls="sw-settings" aria-expanded={optionsOpen}>設定</button>
              {lessonActive && <button type="button" className="sw-end" disabled={isSending || isEnding || materialBusy} onClick={() => void endLesson()}>終了する</button>}
            </div>
          </header>
          {lessonActive && <div className="sw-progress" role="progressbar" aria-label="レッスンの経過時間" aria-valuenow={Math.min(elapsedSeconds, totalSeconds)} aria-valuemin={0} aria-valuemax={totalSeconds} aria-valuetext={`${settings.durationMinutes}分中、${Math.floor(elapsedSeconds / 60)}分経過`}><div style={{ width: `${Math.min(100, elapsedSeconds / totalSeconds * 100)}%` }} /></div>}
          {(source.documentId || source.scriptId || source.contentId) && lessonActive && <div className="sw-selected-material"><button type="button" className="sw-material-title" onClick={() => openMaterials(source.kind || (source.documentId ? "pdf" : source.contentId ? "vidmatch" : "reading"))}><span>使用中の教材</span><strong>{source.title || (source.documentId ? "PDF" : source.contentId ? "VidMatch" : "読む教材")}</strong></button><button type="button" className="sw-text-link" disabled={isSending || isEnding || materialBusy} onClick={() => changeSource({})}>選択を解除</button></div>}
          <div className="sw-messages" onScroll={event => { const element = event.currentTarget; stickToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100; }} role="log" aria-label="AIとの会話" aria-live="polite" aria-relevant="additions text">
            {!chatLog.length && !isSending && <div className="sw-empty"><h3>文字でも音声でも練習できます</h3><p>「レッスンを始める」を選ぶと、AIから最初の質問が届きます。</p></div>}
            {chatLog.map((entry, index) => <article key={entry.id} className={`sw-msg ${entry.sender}`}><div className="sw-message-head"><span className="sw-sender">{entry.sender === "assistant" ? "SpeakWiseAI" : "あなた"}</span>{entry.sender === "assistant" && <button type="button" className="sw-voice-button" disabled={voiceLoading || entry.transcriptPending} onClick={() => void playVoice(entry.text)} aria-label={`AIの${index + 1}番目のメッセージを音声で再生`}>{voiceLoading ? "音声を準備中…" : "音声で聞く"}</button>}</div><p lang={languageTag(targetLanguage)}>{entry.text}</p>{entry.action && <button className="sw-topic sw-material-invitation" disabled={isSending || isEnding || !lessonActive || materialBusy} onClick={() => { if (entry.action?.type === "open_materials") openMaterials(entry.action.material); else { openMaterials(); void workspaceRef.current?.execute(entry.action!, { requestId: entry.id, context: entry.requestContext || lessonRequestContext() }); } }}>{entry.action.type === "open_materials" ? MATERIAL_ACTION_LABELS[entry.action.material] : "学習アクションを再表示・再試行"}</button>}{entry.citations?.map((citation, citeIndex) => <details className="sw-citation" key={citeIndex}><summary>出典 {citation.page ? `p. ${citation.page}` : citeIndex + 1}</summary><p>{citation.excerpt || "選択した教材を参照しています。"}</p></details>)}</article>)}
            {isSending && <div className="sw-msg assistant" role="status"><span className="sw-sender">SpeakWiseAI</span><p>{lessonActive ? pendingDescription || "返答を考えています…" : "レッスンを準備しています…"}</p></div>}
            {isEnding && <div className="sw-note" role="status">今日の振り返りをまとめています…</div>}
            {error && lessonViewStarted && <div className="sw-alert" role="alert"><p>{error}</p>{retryText && lessonActive && <button type="button" className="sw-text-link" disabled={isSending} onClick={() => void sendMessage(true)}>もう一度送信</button>}{lessonEnded && !summary && <button type="button" className="sw-text-link" disabled={isEnding} onClick={() => void endLesson()}>振り返りを再作成</button>}</div>}
            {summary && <section className="sw-summary" aria-labelledby="sw-summary-title"><h2 id="sw-summary-title">{summary.title || "今日の振り返り"}</h2>{(summarySaved || !accessToken) && <p className="sw-note">{summarySaved ? "学習履歴に保存しました。" : "ログインすると、今後のレッスンを学習履歴に保存できます。"}</p>}{[
              { label: "練習したこと", items: summary.covered }, { label: "できたこと", items: summary.strengths },
              { label: "次に伸ばしたいこと", items: summary.weaknesses }, { label: "次の練習のヒント", items: summary.recommendations },
              { label: "覚えておきたい表現", items: summary.usefulVocabulary }, { label: "記録の限界・未確認のこと", items: summary.uncertainty },
            ].map(({ label, items }) => Array.isArray(items) && items.length > 0 && <div className="sw-summary-group" key={label}><h3>{label}</h3><ul>{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>)}</section>}
            <div ref={chatEndRef} />
          </div>
          {notice && lessonViewStarted && <div className="sw-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="お知らせを閉じる">×</button></div>}
          {lessonEnded ? <div className="sw-completion-actions"><button type="button" className="pf-button" disabled={isEnding} onClick={prepareNextLesson}>次のレッスンを準備</button>{summary && !summarySaved && accessToken && <button type="button" className="pf-button pf-button-secondary" disabled={isEnding} onClick={() => { setIsEnding(true); void persistSummary().then(setSummarySaved).finally(() => setIsEnding(false)); }}>振り返りの保存を再試行</button>}</div>
            : lessonViewStarted ? <div className="sw-composer-area">
              <div className="sw-live-controls">
                {voiceActive ? <>
                  <span className="sw-live-status" role="status">{voiceStatus === "connecting" ? "接続中…" : voiceStatus === "speaking" ? "AIが話しています" : voiceStatus === "thinking" ? "返答を準備中…" : micMuted ? "マイクはミュート中" : "聞いています"}</span>
                  <button type="button" className="sw-topic" disabled={voiceStatus === "connecting"} aria-pressed={micMuted} onClick={() => { realtimeRef.current?.setMuted(!micMuted); setMicMuted(!micMuted); }}>{micMuted ? "マイクをオン" : "マイクをミュート"}</button>
                  <button type="button" className="sw-topic" onClick={stopRealtime}>音声会話を終了</button>
                  {livePlaybackBlocked && <button type="button" className="sw-text-link" onClick={() => { void liveAudioRef.current?.play().then(() => { setLivePlaybackBlocked(false); setNotice(""); }).catch(() => setNotice("音声を再生できませんでした。再接続してください。")); }}>AI音声を再生</button>}
                </> : <button type="button" className="sw-topic" disabled={!lessonActive || isSending || isEnding} onClick={() => void startRealtime()}>音声で会話する</button>}
              </div>
              <div className="sw-composer"><label className="sw-sr-only" htmlFor="sw-message">英語の回答</label><textarea id="sw-message" ref={inputRef} className="sw-textarea" value={input} maxLength={8000} disabled={!lessonActive || isEnding} onChange={(event) => setInput(event.target.value)} placeholder="英語で入力…" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendMessage(); } }} /><button type="button" className="sw-send" disabled={!lessonActive || !input.trim() || isSending || isEnding || (voiceActive && voiceBusy)} onClick={() => void sendMessage()}>送信</button></div><p className="sw-save-status" role="status">{saveStatus}{saveStatus.startsWith("未保存") && <button className="sw-text-link" onClick={() => void flushVoiceTurns().then(() => saveLessonState()).catch(() => setNotice("保存を再試行できませんでした。"))}>保存を再試行</button>}</p><p className="sw-composer-hint">{voiceActive ? "AI生成音声 · 話し終えると自動で返答します。文字でも送信できます。教材の操作は文字入力で続けられます。" : "Enterで送信 · Shift + Enterで改行 · 音声会話も選べます"}</p></div> : null}
        </section>
      </div>
      <audio ref={liveAudioRef} autoPlay aria-label="リアルタイムのAI生成音声" />
      <div className="sw-audio-player sw-audio-floating" hidden={!audioVisible}><audio ref={audioElementRef} controls aria-label="AI生成音声の再生コントロール" /><button className="sw-topic" onClick={() => { stopMedia(); setAudioVisible(false); }} aria-label="音声プレーヤーを閉じる">×</button></div>
      {notice && !lessonViewStarted && <div className="sw-setup-notice" role="status">{notice}</div>}
    </main>
  );
}
