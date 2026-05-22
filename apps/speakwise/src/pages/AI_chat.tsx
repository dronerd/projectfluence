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
  { id: "listening_practice", label: "Listening Practice", labelJa: "リスニング練習", short: "短い音声風の英文を聞く想定で、理解度を確認します" },
  { id: "reading_comprehension", label: "Reading Comprehension", labelJa: "読解練習", short: "レベルに合った短い英文を読み、内容理解を深めます" },
  { id: "pdf_reading", label: "PDF-Based Reading", labelJa: "PDF読解練習", short: "アップロードまたは貼り付けた文章を使って読解問題を作ります" },
  { id: "writing_feedback", label: "Writing & Feedback", labelJa: "ライティング添削", short: "短い文章を書き、文法・語彙・構成・自然さを改善します" },
  { id: "deep_discussion", label: "Deep Discussion", labelJa: "深いディスカッション", short: "抽象的・学術的な話題で、意見の組み立て方を練習します" },
  { id: "review_weakness", label: "Review & Weakness", labelJa: "弱点復習", short: "過去のミスや苦手分野をもとに、必要な練習を集中して行います" },
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
    durationMinutes: DURATION_OPTIONS.includes(Number(raw.durationMinutes))
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
  if (!memory) return "まだ保存された学習メモリーはありません。";
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
    recent?.summary?.weaknesses?.length ? `最近の弱点: ${recent.summary.weaknesses.join(", ")}` : "",
    patterns.length ? `繰り返し出ているミス: ${patterns.join("; ")}` : "",
    vocab.length ? `VocabStreamの学習状況: ${vocab.join("; ")}` : "",
    videos.length ? `VidMatchの視聴トピック: ${videos.join("; ")}` : "",
  ].filter(Boolean).join("\n") || "まだ強い学習傾向は見つかっていません。";
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
    if (!SPEAKWISE_API_URL) {
      throw new Error("SpeakWise APIのURLが本番環境に設定されていません。");
    }

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
      setChatLog([{ sender: "assistant", text: "今日はどんな英語を練習したいですか？下のボタンから選んでください。" }]);
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
      const message = error instanceof Error ? error.message : "不明なエラーが発生しました。";
      setChatLog([{ sender: "assistant", text: `レッスンを開始できませんでした。${message}` }]);
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
      setChatLog((prev) => [...prev, { sender: "assistant", text: "すみません。今回はAIからの返答を取得できませんでした。" }]);
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
      const farewell = data.farewell || "今日のレッスン、お疲れさまでした。次回もこの内容をもとに続けましょう。";
      setChatLog((prev) => [...prev, { sender: "assistant", text: farewell }]);
      if (settings.voiceEnabled) await playVoice(farewell);
      await persistSummary(nextSummary);
    } catch (error) {
      console.error(error);
      setChatLog((prev) => [...prev, { sender: "assistant", text: "今日のレッスンはここで終了です。詳細な要約は保存できませんでしたが、よく頑張りました。" }]);
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
    if (!SPEAKWISE_API_URL) {
      console.warn("SpeakWise API URL is not configured for voice playback.");
      return;
    }

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
      alert("このブラウザでは音声入力がサポートされていません。テキストで入力してください。");
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
      pdfContext: `PDFファイル: ${file.name}\nブラウザ上で本文を直接読み取れない場合は、練習したい箇所の文章をここに貼り付けてください。`,
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
                <p>学習履歴をもとに成長を支える英語AI</p>
              </div>
            </div>

            <div className="sw-section">
              <span className="sw-label">英語レベル</span>
              <div className="sw-grid levels">
                {LEVELS.map((level) => (
                  <button key={level} className={`sw-button ${settings.level === level ? "active" : ""}`} onClick={() => updateSettings({ level })}>
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div className="sw-section">
              <span className="sw-label">レッスン時間</span>
              <select className="sw-select" value={settings.durationMinutes} onChange={(event) => updateSettings({ durationMinutes: Number(event.target.value) })}>
                {DURATION_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>{minutes}分</option>
                ))}
              </select>
            </div>

            <div className="sw-section">
              <span className="sw-label">練習したいトピック</span>
              <div className="sw-grid">
                {TOPICS.map((topic) => (
                  <button key={topic} className={`sw-button ${settings.selectedTopics.includes(topic) ? "active" : ""}`} onClick={() => toggleTopic(topic)}>
                    {TOPIC_LABELS[topic] || topic}
                  </button>
                ))}
              </div>
              <input className="sw-input" style={{ marginTop: 8 }} value={settings.customTopic} onChange={(event) => updateSettings({ customTopic: event.target.value })} placeholder="その他のトピックを自由に入力" />
            </div>

            <div className="sw-section">
              <span className="sw-label">レッスンモード</span>
              <div style={{ display: "grid", gap: 8 }}>
                {LESSON_MODES.map((mode) => (
                  <button key={mode.id} className={`sw-mode ${settings.lessonMode === mode.id ? "active" : ""}`} onClick={() => updateSettings({ lessonMode: mode.id })}>
                    <strong>{mode.labelJa}</strong>
                    <span>{mode.short}</span>
                  </button>
                ))}
              </div>
            </div>

            {settings.lessonMode === "pdf_reading" && (
              <div className="sw-section">
                <span className="sw-label">PDF・読解テキスト</span>
                <input className="sw-input" type="file" accept=".pdf,.txt,text/plain,application/pdf" onChange={(event) => void handlePdfFile(event.target.files?.[0] ?? null)} />
                <textarea className="sw-textarea" style={{ marginTop: 8 }} value={settings.pdfContext} onChange={(event) => updateSettings({ pdfContext: event.target.value.slice(0, 8000) })} placeholder="PDFの一部や、読解に使いたい英文をここに貼り付けてください。" />
              </div>
            )}

            <div className="sw-section">
              <span className="sw-label">音声</span>
              <label className="sw-toggle">
                <span>AIの返答を音声で再生</span>
                <input type="checkbox" checked={settings.voiceEnabled} onChange={(event) => updateSettings({ voiceEnabled: event.target.checked })} />
              </label>
              <select className="sw-select" style={{ marginTop: 8 }} value={settings.selectedVoice} onChange={(event) => updateSettings({ selectedVoice: event.target.value })}>
                {VOICES.map((voice) => <option key={voice} value={voice}>{voice}</option>)}
              </select>
              <label className="sw-toggle">
                <span>選択したモードですぐ始める</span>
                <input type="checkbox" checked={settings.directStart} onChange={(event) => updateSettings({ directStart: event.target.checked })} />
              </label>
            </div>

            <button className="sw-start" disabled={isSending || isEnding} onClick={() => void startLesson()}>
              {settings.lessonMode ? "レッスンを開始" : "AIに練習内容を相談する"}
            </button>
            {lessonActive && (
              <button className="sw-start secondary" disabled={isEnding} onClick={() => void endLesson()}>
                終了して要約を保存
              </button>
            )}

            <div className="sw-section">
              <span className="sw-label">学習メモリー</span>
              <div className="sw-memory">{memoryPreview}</div>
            </div>
          </aside>

          <section className="sw-chat">
            <header className="sw-chat-head">
              <div className="sw-chat-title">
                <img src="/images/speakwise.png" alt="" />
                <div>
                  <strong>{selectedMode?.labelJa || "あなたに合わせた英語レッスン"}</strong>
                  <span>{lessonActive ? "保存された学習履歴をもとに、今のレッスン内容を調整しています。" : "モードを選ぶか、AIに今日の練習内容を相談できます。"}</span>
                </div>
              </div>
              <div className="sw-status">
                <span className="sw-chip">{settings.level}</span>
                <span className="sw-chip">{settings.durationMinutes}分</span>
                {lessonStartedAt && <span className="sw-chip">残り {formatTime(remainingSeconds)}</span>}
                <span className="sw-chip">{settings.voiceEnabled ? "音声オン" : "音声オフ"}</span>
              </div>
            </header>

            <div className="sw-messages" role="log" aria-live="polite">
              {chatLog.length === 0 ? (
                <div className="sw-empty">
                  <div>
                    <strong>今日はどんな英語を練習しますか？</strong>
                    <p>レッスンを始めると、過去の学習履歴、苦手なミス、VocabStreamの進捗、VidMatchの視聴トピックを必要に応じて活用します。</p>
                  </div>
                </div>
              ) : (
                <>
                  {chatLog.map((entry, index) => (
                    <div key={`${entry.sender}-${index}`} className={`sw-msg ${entry.sender}`}>
                      {entry.text}
                      {entry.sender === "assistant" && (
                        <div style={{ marginTop: 8 }}>
                          <button className="sw-button" onClick={() => void playVoice(entry.text)}>音声で再生</button>
                        </div>
                      )}
                    </div>
                  ))}

                  {pendingModeChoice && (
                    <div className="sw-mode-actions">
                      {LESSON_MODES.map((mode) => (
                        <button key={mode.id} className="sw-button" onClick={() => void startLesson(mode.id)}>
                          {mode.labelJa}
                        </button>
                      ))}
                    </div>
                  )}

                  {summary && (
                    <div className="sw-summary">
                      <h2>{summary.title || "レッスン要約"}</h2>
                      {[
                        { label: "今日扱った内容", items: summary.covered },
                        { label: "よくできた点", items: summary.strengths },
                        { label: "今後の課題", items: summary.weaknesses },
                        { label: "次におすすめの練習", items: summary.recommendations },
                        { label: "今日の重要表現", items: summary.usefulVocabulary },
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
              {isSending && <div className="sw-msg assistant">考えています...</div>}
              {isEnding && <div className="sw-msg assistant">レッスン要約を作成しています...</div>}
            </div>

            <div className="sw-composer">
              <button className={`sw-icon ${isListening ? "active" : ""}`} onClick={toggleListening} title="音声入力" aria-label="音声入力">
                {isListening ? "停止" : "音声"}
              </button>
              <textarea
                className="sw-textarea"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="英語で答えを入力してください。質問してもOKです。"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
              />
              <button className="sw-send" disabled={!input.trim() || isSending || isEnding} onClick={() => void sendMessage()}>
                送信
              </button>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
