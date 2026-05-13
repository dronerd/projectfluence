import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiSubmitVocabStreamProgress, type VocabStreamQuestionAttempt } from "../api";
import { useAuth } from "../AuthContext";
import { speakEnglish } from "./speech"; 

interface LessonWord {
  word: string;
  example?: string;
  meaning?: string;
  japaneseMeaning?: string;
  synonyms?: string;
  antonyms?: string;
  [k: string]: any;
}

interface LessonData {
  title?: string;
  paragraph?: string;
  words: LessonWord[];
  [k: string]: any;
}

interface QuizQuestion {
  word: string;
  sentence: string;
  blank_sentence: string;
  choices: string[];
  answer_index: number;
}

// New type for meaning-mcq questions
interface MeaningQuestion {
  originalIndex: number; // index into lesson.words
  prompt: string; // meaning text
  choices: string[]; // words
  answer_index: number;
}

const Lesson: React.FC = () => {
  const { lessonId } = useParams<{ lessonId: string }>();
  const [step, setStep] = useState<number>(0);
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const nav = useNavigate();
  const { user } = useAuth();

  // quiz state (example-sentence quiz)
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizIndex, setQuizIndex] = useState<number>(0);
  const [quizScore, setQuizScore] = useState<number>(0);
  const [quizLoading, setQuizLoading] = useState<boolean>(false);
  const [quizError, setQuizError] = useState<boolean>(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [hoveredQuizChoice, setHoveredQuizChoice] = useState<number | null>(null);
  const [quizAttempted, setQuizAttempted] = useState<boolean>(false);
  // store mistaken quiz question objects so we can replay exact items
  const [wrongQuizItems, setWrongQuizItems] = useState<QuizQuestion[]>([]);

  // meaning-mcq state (replaces the old matching UI)
  const [meaningQuestions, setMeaningQuestions] = useState<MeaningQuestion[]>([]);
  const [meaningIndex, setMeaningIndex] = useState<number>(0);
  const [meaningScore, setMeaningScore] = useState<number>(0);
  const [meaningLoading, setMeaningLoading] = useState<boolean>(false);
  const [meaningError, setMeaningError] = useState<boolean>(false);
  const [meaningSelectedChoice, setMeaningSelectedChoice] = useState<number | null>(null);
  const [hoveredMeaningChoice, setHoveredMeaningChoice] = useState<number | null>(null);
  const [meaningAttempted, setMeaningAttempted] = useState<boolean>(false);
  // store mistaken meaning question objects (they include originalIndex)
  const [wrongMeaningItems, setWrongMeaningItems] = useState<MeaningQuestion[]>([]);

  // state 追加（既存 state の近くに）
  const [isReplayMode, setIsReplayMode] = useState(false);
  const [replayType, setReplayType] = useState<"meaning" | "quiz" | null>(null);
  const [replayResult, setReplayResult] = useState({
    completed: false,
    meaningCorrect: 0,
    meaningTotal: 0,
    quizCorrect: 0,
    quizTotal: 0,
  });

  // responsive / touch state
  const [isSmallScreen, setIsSmallScreen] = useState<boolean>(false);
  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(false);
  const [animatedPercent, setAnimatedPercent] = useState<number>(0);
  const [animatedReplayPercent, setAnimatedReplayPercent] = useState<number>(0);
  const [finalPraiseMessage, setFinalPraiseMessage] = useState<string>("");
  const [questionAttempts, setQuestionAttempts] = useState<VocabStreamQuestionAttempt[]>([]);
  const [progressSubmitError, setProgressSubmitError] = useState<string>("");

  // finish lock/overlay to avoid duplicate praise
  const [finishLock, setFinishLock] = useState<boolean>(false);

  // audio context ref for playing chime
  const audioCtxRef = useRef<AudioContext | null>(null);
  const preReplayMeaningQuestionsRef = useRef<MeaningQuestion[] | null>(null);
  const preReplayQuizQuestionsRef = useRef<QuizQuestion[] | null>(null);
  const attemptOrderRef = useRef(0);
  const submittedProgressKeysRef = useRef<Set<string>>(new Set());

  // audio unlock
  async function unlockAudio(): Promise<void> {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current!;
      if (ctx.state === "suspended") {
        await ctx.resume();
        const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        src.start(0);
        src.stop(0);
      }
    } catch (e) {
      console.warn("unlockAudio failed", e);
    }
  }

  // Helper: try fetch JSON
  async function tryFetchJson(path: string): Promise<any | null> {
    try {
      const r = await fetch(path, { cache: "no-cache" });
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      return null;
    }
  }

  // load lesson data from public/data
  useEffect(() => {
    if (!lessonId) return;
    let cancelled = false;
    async function loadLocalLesson(id: string): Promise<LessonData | null> {
      if (!id.includes("-lesson-")) {
        console.error("invalid lesson id format:", id);
        return null;
      }
      const [genreFolder, numStr] = id.split("-lesson-");
      if (!genreFolder || !numStr) return null;
      const candidates = [
        `/vocabstream/data/${genreFolder}/Lesson${numStr}.json`,
        `/vocabstream/data/${genreFolder}/lesson${numStr}.json`,
        `/vocabstream/data/${genreFolder}/Lesson${parseInt(numStr, 10)}.json`,
        `/vocabstream/data/${genreFolder}/lesson${parseInt(numStr, 10)}.json`,
      ];
      for (const p of candidates) {
        const res = await tryFetchJson(p);
        if (res) return res as LessonData;
      }
      return null;
    }

    setLesson(null);
    setQuestionAttempts([]);
    setProgressSubmitError("");
    attemptOrderRef.current = 0;
    submittedProgressKeysRef.current = new Set();
    loadLocalLesson(lessonId).then((data) => {
      if (cancelled) return;
      if (!data) {
        console.warn("lesson file not found locally for", lessonId);
        setLesson({ words: [] } as LessonData);
      } else {
        setLesson(data);
      }
    });
    return () => { cancelled = true; };
  }, [lessonId]);

  // detect small screen & touch
  useEffect(() => {
    function update() {
      try {
        const small = window.matchMedia && window.matchMedia("(max-width: 600px)").matches;
        setIsSmallScreen(Boolean(small));
      } catch {
        setIsSmallScreen(window.innerWidth <= 600);
      }
      const touch = "ontouchstart" in window || (navigator && (navigator as any).maxTouchPoints > 0);
      setIsTouchDevice(Boolean(touch));
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  // generate quiz when entering quiz step (example-sentence quiz)
  useEffect(() => {
    if (!lesson) return;
    const totalWords = lesson.words ? lesson.words.length : 0;
    const quizStep = totalWords + 2; // example-sentence quiz
    if (step === quizStep) {
      if (isReplayMode && replayType === "quiz") return;
      setQuizLoading(true);
      setQuizError(false);
      try {
        const generated = generateQuizFromLesson(lesson);
        setQuizQuestions(generated);
        setQuizIndex(0);
        setQuizScore(0);
        setFinalScore(null);
        setSelectedChoice(null);
      } catch (e) {
        console.error("quiz generation failed", e);
        setQuizQuestions([]);
        setQuizError(true);
      } finally {
        setQuizLoading(false);
      }
    }
  }, [step, lesson, isReplayMode, replayType]);

  // prepare meaning-mcq when entering matching step
  useEffect(() => {
    if (!lesson) return;
    const totalWords = lesson.words ? lesson.words.length : 0;
    const matchingStep = totalWords + 1; // this step will now be meaning MCQ
    if (step === matchingStep) {
      if (isReplayMode && replayType === "meaning") return;
      setMeaningLoading(true);
      setMeaningError(false);
      try {
        const generated = generateMeaningQuizFromLesson(lesson);
        setMeaningQuestions(generated);
        setMeaningIndex(0);
        setMeaningScore(0);
        setMeaningSelectedChoice(null);
        setMeaningAttempted(false);
      } catch (e) {
        console.error("meaning quiz generation failed", e);
        setMeaningQuestions([]);
        setMeaningError(true);
      } finally {
        setMeaningLoading(false);
      }
    }
  }, [step, lesson, isReplayMode, replayType]);

  // prevent scroll to weird spot on slides
  useEffect(() => {
    try {
      if (!lesson) return;
      const totalWords = lesson.words ? lesson.words.length : 0;
      const slideStep = step - 1;
      const isSlideLocal = step > 0 && slideStep < totalWords;
      if (!isSlideLocal) return;
      if (typeof window !== "undefined" && window.scrollTo) {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
    } catch (e) { }
  }, [step, lesson]);

  useEffect(() => {
    if (!lesson) {
      setAnimatedPercent(0);
      setAnimatedReplayPercent(0);
      setFinalPraiseMessage("");
      return;
    }

    const totalWords = lesson.words ? lesson.words.length : 0;
    if (step !== totalWords + 3) {
      setAnimatedPercent(0);
      setAnimatedReplayPercent(0);
      setFinalPraiseMessage("");
      return;
    }

    const matchingAttempted = meaningAttempted || meaningQuestions.length > 0;
    const quizAttemptedFlag = quizAttempted;
    const matchingDisplayScore = matchingAttempted ? meaningScore : 0;
    const matchingDisplayMax = matchingAttempted ? totalWords : 0;
    const quizDisplayScore = quizAttemptedFlag ? finalScore ?? quizScore : 0;
    const quizDisplayMax = quizAttemptedFlag ? quizQuestions.length || 1 : 0;
    const attemptedTotalScore = matchingDisplayScore + quizDisplayScore;
    const attemptedTotalMax = matchingDisplayMax + quizDisplayMax;
    const targetPercent = attemptedTotalMax ? Math.round((attemptedTotalScore / attemptedTotalMax) * 100) : 0;

    setFinalPraiseMessage(getPraise(targetPercent));
    setAnimatedPercent(0);

    let frameId = 0;
    const start = performance.now();
    const duration = 1200;
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setAnimatedPercent(Math.round(targetPercent * easeOutCubic(progress)));
      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [
    step,
    lesson,
    meaningAttempted,
    meaningQuestions.length,
    meaningScore,
    quizAttempted,
    finalScore,
    quizScore,
    quizQuestions.length,
  ]);

  useEffect(() => {
    if (!lesson) {
      setAnimatedReplayPercent(0);
      return;
    }

    const totalWords = lesson.words ? lesson.words.length : 0;
    if (step !== totalWords + 3 || !replayResult.completed) {
      setAnimatedReplayPercent(0);
      return;
    }

    const replayTotalScore = replayResult.meaningCorrect + replayResult.quizCorrect;
    const replayTotalMax = replayResult.meaningTotal + replayResult.quizTotal;
    const targetPercent = replayTotalMax ? Math.round((replayTotalScore / replayTotalMax) * 100) : 0;

    setAnimatedReplayPercent(0);
    let frameId = 0;
    const start = performance.now();
    const duration = 900;
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setAnimatedReplayPercent(Math.round(targetPercent * easeOutCubic(progress)));
      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [
    step,
    lesson,
    replayResult.completed,
    replayResult.meaningCorrect,
    replayResult.meaningTotal,
    replayResult.quizCorrect,
    replayResult.quizTotal,
  ]);

  useEffect(() => {
    if (!lesson || !lessonId) return;

    const totalWords = lesson.words ? lesson.words.length : 0;
    if (step !== totalWords + 3) return;

    const parsedLesson = parseLessonId(lessonId);
    if (!parsedLesson) return;

    const matchingAttempted = meaningAttempted || meaningQuestions.length > 0;
    const quizAttemptedFlag = quizAttempted;
    const meaningTotal = matchingAttempted ? totalWords : 0;
    const quizTotal = quizAttemptedFlag ? quizQuestions.length || 1 : 0;
    const stableKey = [
      lessonId,
      questionAttempts.length,
      meaningScore,
      finalScore ?? quizScore,
      replayResult.completed ? "replay" : "initial",
      replayResult.meaningCorrect,
      replayResult.quizCorrect,
    ].join(":");

    if (submittedProgressKeysRef.current.has(stableKey)) return;
    submittedProgressKeysRef.current.add(stableKey);

    const replayCorrect = replayResult.meaningCorrect + replayResult.quizCorrect;
    const replayTotal = replayResult.meaningTotal + replayResult.quizTotal;

    apiSubmitVocabStreamProgress({
      anonymousUserId: getOrCreateAnonymousUserId(),
      userUsername: user?.username,
      lessonId,
      genre: parsedLesson.genre,
      lessonNumber: parsedLesson.lessonNumber,
      lessonTitle: lesson.title ?? null,
      wordCount: totalWords,
      meaningScore: matchingAttempted ? meaningScore : 0,
      meaningTotal,
      quizScore: quizAttemptedFlag ? finalScore ?? quizScore : 0,
      quizTotal,
      replayCompleted: replayResult.completed,
      replayCorrect,
      replayTotal,
      questionAttempts,
    }).then(() => {
      setProgressSubmitError("");
    }).catch((error) => {
      const message = error instanceof Error ? error.message : "Failed to save progress";
      console.warn("VocabStream progress tracking failed", error);
      setProgressSubmitError(message);
    });
  }, [
    step,
    lesson,
    lessonId,
    meaningAttempted,
    meaningQuestions.length,
    meaningScore,
    quizAttempted,
    quizQuestions.length,
    finalScore,
    quizScore,
    replayResult.completed,
    replayResult.meaningCorrect,
    replayResult.meaningTotal,
    replayResult.quizCorrect,
    replayResult.quizTotal,
    questionAttempts,
    user?.username,
  ]);

  if (!lesson) return <div>Loading lesson...</div>;
  const L = lesson!;
  const totalWords = L.words.length;
  const slideStep = step - 1;
  const isSlide = step > 0 && slideStep < totalWords;

  // derive genre folder and lesson number from lessonId like "business-lesson-1"
  const genreFolder = lessonId && lessonId.includes("-lesson-") ? lessonId.split("-lesson-")[0] : null;
  const lessonNumber = lessonId && lessonId.includes("-lesson-") ? parseInt(lessonId.split("-lesson-")[1], 10) : null;

  function getPraise(percent: number): string {
    if (!Number.isFinite(percent)) percent = 0;
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;
    const messages = {
      low: [
        "よく頑張りました！まずは最後まで取り組めたことが大きな一歩です。",
        "ここから伸びます。間違えた単語ほど、次に覚えやすくなります。",
        "今日の挑戦が次の土台になります。少しずつ積み上げていきましょう！",
        "まだウォームアップ段階です。次は見覚えのある単語が増えているはずです。",
        "学習のリズム作りはできています。焦らず、もう一周してみましょう。",
        "ここで止まらなければ大丈夫。復習すると一気に景色が変わります。",
      ],
      midLow: [
        "順調です！覚えかけの単語が増えてきています。",
        "いい流れです。次は迷った問題を中心に固めていきましょう。",
        "基礎が少しずつつながっています。継続がそのまま力になります。",
        "確実に前進しています。あと少しで正答が安定してきそうです。",
        "手応えが出てきましたね。復習すると定着がぐっと強くなります。",
        "学習の芯ができてきています。次の挑戦でさらに伸ばせます。",
      ],
      mid: [
        "いい調子です！理解できている単語がかなり増えています。",
        "ここまで来ればあとひと息です。迷った単語をもう一度見直しましょう。",
        "バランスよく取れています。この調子で正確さを磨いていきましょう。",
        "なかなか良い出来です。次は正答率アップを狙えます。",
        "意味と例文のつながりが見えてきています。かなり良い練習になっています。",
        "安定感が出ています。もう一段、語彙の解像度を上げていきましょう。",
      ],
      high: [
        "とてもよくできました！かなり高い理解度です。",
        "素晴らしい集中力です。単語の使い方までつかめてきています。",
        "いい完成度です。あと少し整えるとかなり強いです。",
        "かなり安定しています。次のレッスンにも自信を持って進めます。",
        "よく覚えています！意味と例文の結びつきがしっかりしています。",
        "高得点です。ここまで取れれば実戦でも使いやすくなります。",
      ],
      nearPerfect: [
        "素晴らしい、ほぼ完璧です！最後の数語だけ確認しましょう。",
        "すごい完成度です。あと一歩で完全制覇です！",
        "努力の成果がしっかり出ています。かなり頼もしい仕上がりです。",
        "ほとんど定着しています。仕上げの復習でさらに強くなります。",
        "見事です。細かい迷いを消せば、次は満点も狙えます。",
        "かなり鋭い理解です。単語が自分のものになってきています。",
      ],
      perfect: [
        "完璧です！おめでとうございます！",
        "満点です。今日のレッスンはしっかり制覇できました！",
        "文句なしの出来です。次のレッスンへ気持ちよく進めます。",
        "最高の結果です。集中と理解がきれいに噛み合っています。",
        "すばらしい満点です。語彙力が一段上がっています。",
        "完全攻略です！この調子で次もいきましょう。",
      ],
    };
    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
    if (percent <= 20) return pick(messages.low);
    if (percent <= 40) return pick(messages.midLow);
    if (percent <= 60) return pick(messages.mid);
    if (percent <= 80) return pick(messages.high);
    if (percent <= 90) return pick(messages.nearPerfect);
    return pick(messages.perfect);
  }

  // responsive sizes & button styles
  const headingSize = isSmallScreen ? 22 : 32;
  const headingSize2 = isSmallScreen ? 17 : 32;
  const mainWordSize = isSmallScreen ? 32 : 48; // slightly reduced but still large
  const wordListSize = isSmallScreen ? 16 : 34;
  const paragraphFontSize = isSmallScreen ? 15 : 20;
  const quizTextSize = isSmallScreen ? 18 : 28;
  const buttonFontSize = isSmallScreen ? 15 : 18;
  const buttonWidth = isSmallScreen ? "100%" : 320;
  const panelStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 900,
    background: "#ffffff",
    border: "1px solid rgba(96, 165, 250, 0.22)",
    borderRadius: isSmallScreen ? 18 : 24,
    boxShadow: "0 18px 42px rgba(15, 23, 42, 0.12)",
    padding: isSmallScreen ? "18px 14px" : "28px 32px",
    color: "#10203b",
  };
  const blueButtonStyle: React.CSSProperties = {
    fontSize: buttonFontSize,
    padding: isSmallScreen ? "12px 14px" : "13px 22px",
    marginTop: 12,
    background: "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 58%, #06b6d4 100%)",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    cursor: "pointer",
    width: buttonWidth,
    fontWeight: 800,
    boxShadow: "0 10px 22px rgba(37, 99, 235, 0.26)",
    lineHeight: 1.25,
  };
  const mediumBlueButtonStyle: React.CSSProperties = {
    ...blueButtonStyle,
    background: "linear-gradient(135deg, #2760a8 0%, #5687cc 70%, #42a8c4 100%)",
    boxShadow: "0 10px 20px rgba(37, 99, 235, 0.2)",
  };
  const nextButtonStyle: React.CSSProperties = { ...blueButtonStyle, width: isSmallScreen ? "100%" : 220 };
  const choiceButtonBackground = "linear-gradient(135deg, #2760a8 0%, #5687cc 70%, #42a8c4 100%)";
  const choiceButtonShadow = "0 8px 18px rgba(37,99,235,0.14)";
  const mutedButtonStyle: React.CSSProperties = {
    ...nextButtonStyle,
    background: "linear-gradient(135deg, #e5e7eb 0%, #cbd5e1 100%)",
    color: "#10203b",
    boxShadow: "0 8px 18px rgba(15, 23, 42, 0.12)",
  };

  // PLAY bright celebratory chime for correct answers
  async function playCorrectSound() {
    try {
      await unlockAudio();
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current!;

      const freqs = [1046.5, 1318.5, 1568.0]; // C6, E6, G6
      const gain = ctx.createGain();
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = i === 0 ? "sine" : "triangle";
        osc.frequency.value = f;
        try { osc.detune.value = (i - 1) * 10; } catch (e) { }
        osc.connect(gain);
        osc.start(now + i * 0.02 + 0.01);
        osc.stop(now + 1.0 + 0.01);
      });
    } catch (e) {
      // swallow errors to avoid breaking UI
    }
  }

  // play the previous (darker) chime for WRONG answers
  async function playWrongSound() {
    try {
      await unlockAudio();
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current!;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.value = 0.001; // small non-zero start
      o.connect(g);
      g.connect(ctx.destination);
      const now = ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.12, now + 0.01);
      o.start(now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      o.stop(now + 0.5 + 0.01);
    } catch (e) {
      // ignore audio errors
    }
  }

  function recordQuestionAttempt(
    attempt: Omit<VocabStreamQuestionAttempt, "attemptOrder" | "answeredAt">,
  ) {
    attemptOrderRef.current += 1;
    setQuestionAttempts((prev) => [
      ...prev,
      {
        ...attempt,
        attemptOrder: attemptOrderRef.current,
        answeredAt: new Date().toISOString(),
      },
    ]);
  }

  // --- quiz choice handler (example-sentence quiz) ---
  async function handleChoose(choiceIndex: number) {
    if (!quizQuestions[quizIndex] || selectedChoice !== null) return;

    await unlockAudio();

    const q = quizQuestions[quizIndex];
    const isCorrect = choiceIndex === q.answer_index;
    recordQuestionAttempt({
      questionType: "quiz",
      word: q.word,
      prompt: q.blank_sentence || q.sentence,
      correctAnswer: q.choices[q.answer_index] ?? q.word,
      selectedAnswer: q.choices[choiceIndex] ?? "",
      isCorrect,
      isReplay: isReplayMode && replayType === "quiz",
      choices: q.choices,
    });
    setSelectedChoice(choiceIndex);
    if (!isReplayMode) setQuizAttempted(true);
    if (isCorrect) {
      if (!isReplayMode) setQuizScore((s) => s + 1);
      if (isReplayMode && replayType === "quiz") {
        setReplayResult((prev) => ({ ...prev, quizCorrect: prev.quizCorrect + 1 }));
      }
      playCorrectSound();
      // remove from wrong items if it was previously mistaken
      setWrongQuizItems((prev) => prev.filter((qq) => !(qq.blank_sentence === q.blank_sentence && qq.word === q.word)));
    } else {
      playWrongSound();
      // record wrong question object if not already recorded (use blank_sentence+word as identifier)
      setWrongQuizItems((prev) => {
        const exists = prev.some((qq) => qq.blank_sentence === q.blank_sentence && qq.word === q.word);
        if (exists) return prev;
        return [...prev, q];
      });
    }
  }

  // --- meaning-mcq choice handler (this mirrors the example-sentence quiz behavior) ---
  async function handleMeaningChoose(choiceIndex: number) {
    if (!meaningQuestions[meaningIndex] || meaningSelectedChoice !== null) return;
    await unlockAudio();
    const q = meaningQuestions[meaningIndex];
    const isCorrect = choiceIndex === q.answer_index;
    recordQuestionAttempt({
      questionType: "meaning",
      word: q.choices[q.answer_index] ?? "",
      prompt: q.prompt,
      correctAnswer: q.choices[q.answer_index] ?? "",
      selectedAnswer: q.choices[choiceIndex] ?? "",
      isCorrect,
      isReplay: isReplayMode && replayType === "meaning",
      choices: q.choices,
    });
    setMeaningSelectedChoice(choiceIndex);
    if (!isReplayMode) setMeaningAttempted(true);
    if (isCorrect) {
      if (!isReplayMode) setMeaningScore((s) => s + 1);
      if (isReplayMode && replayType === "meaning") {
        setReplayResult((prev) => ({ ...prev, meaningCorrect: prev.meaningCorrect + 1 }));
      }
      playCorrectSound();
      // remove from wrong meaning items if present (use originalIndex as key)
      setWrongMeaningItems((prev) => prev.filter((m) => m.originalIndex !== q.originalIndex));
    } else {
      playWrongSound();
      // add wrong meaning question object if not already present
      setWrongMeaningItems((prev) => {
        const exists = prev.some((m) => m.originalIndex === q.originalIndex);
        if (exists) return prev;
        return [...prev, q];
      });
    }
  }

  function finishLesson() {
    if (finishLock) return; // prevent double execution
    setFinishLock(true);
    nav(-1);
  }

  // try to navigate to the next numbered lesson within the same genre folder
  async function goToNextLesson() {
    if (!lessonId) return;
    if (!lessonId.includes("-lesson-")) {
      alert("このレッスンIDは次のレッスンを自動判定できません。");
      return;
    }
    const [genreFolder, numStr] = lessonId.split("-lesson-");
    const currentNum = parseInt(numStr, 10);
    if (Number.isNaN(currentNum)) {
      alert("レッスン番号が不正です");
      return;
    }

    // try a reasonable range ahead (stop early when found)
    const maxLookahead = 50;
    for (let next = currentNum + 1; next <= currentNum + maxLookahead; next++) {
      const candidates = [
        `/vocabstream/data/${genreFolder}/Lesson${next}.json`,
        `/vocabstream/data/${genreFolder}/lesson${next}.json`,
        `/vocabstream/data/${genreFolder}/Lesson${Number(next)}.json`,
        `/vocabstream/data/${genreFolder}/lesson${Number(next)}.json`,
      ];
      for (const path of candidates) {
        const found = await tryFetchJson(path);
        if (found) {
          // reset UI state so the new lesson shows the start page
          setStep(0);
          setQuizQuestions([]);
          setQuizIndex(0);
          setQuizScore(0);
          setSelectedChoice(null);
          setQuizAttempted(false);
          setMeaningQuestions([]);
          setMeaningIndex(0);
          setMeaningScore(0);
          setMeaningSelectedChoice(null);
          setMeaningAttempted(false);
          setWrongQuizItems([]);
          setWrongMeaningItems([]);
          setQuestionAttempts([]);
          setProgressSubmitError("");
          attemptOrderRef.current = 0;
          submittedProgressKeysRef.current = new Set();
          preReplayMeaningQuestionsRef.current = null;
          preReplayQuizQuestionsRef.current = null;
          setIsReplayMode(false);
          setReplayType(null);
          setReplayResult({ completed: false, meaningCorrect: 0, meaningTotal: 0, quizCorrect: 0, quizTotal: 0 });
          // navigate to new lesson route
          nav(`/lesson/${genreFolder}-lesson-${next}`);
          return;
        }
      }
    }
    alert("次の番号のレッスンが見つかりませんでした。別のレッスンを選んでください。");
  }

  // 再生が終わったときに通常モードへ戻すヘルパー
  function finishReplayAndReturn() {
    if (preReplayMeaningQuestionsRef.current) {
      setMeaningQuestions(preReplayMeaningQuestionsRef.current);
      preReplayMeaningQuestionsRef.current = null;
    }
    if (preReplayQuizQuestionsRef.current) {
      setQuizQuestions(preReplayQuizQuestionsRef.current);
      preReplayQuizQuestionsRef.current = null;
    }
    setIsReplayMode(false);
    setReplayType(null);
    setReplayResult((prev) => ({ ...prev, completed: true }));
    setMeaningSelectedChoice(null);
    setSelectedChoice(null);
    setStep(totalWords + 3);
  }

  function startMeaningMistakeReplay(items: MeaningQuestion[]) {
    if (!preReplayMeaningQuestionsRef.current) {
      preReplayMeaningQuestionsRef.current = meaningQuestions.slice();
    }
    setMeaningQuestions(items.slice());
    setMeaningIndex(0);
    setMeaningSelectedChoice(null);
    setMeaningLoading(false);
    setMeaningError(false);
    setIsReplayMode(true);
    setReplayType("meaning");
    setStep(totalWords + 1);
  }

  function startQuizMistakeReplay(items: QuizQuestion[]) {
    if (!preReplayQuizQuestionsRef.current) {
      preReplayQuizQuestionsRef.current = quizQuestions.slice();
    }
    setQuizQuestions(items.slice());
    setQuizIndex(0);
    setSelectedChoice(null);
    setQuizLoading(false);
    setQuizError(false);
    setIsReplayMode(true);
    setReplayType("quiz");
    setStep(totalWords + 2);
  }
  
  // Replay mistakes: filter meaningQuestions and quizQuestions to include only previously-wrong items
  function replayMistakes() {
    const meaningTotal = wrongMeaningItems.length;
    const quizTotal = wrongQuizItems.length;
    setReplayResult({
      completed: false,
      meaningCorrect: 0,
      meaningTotal,
      quizCorrect: 0,
      quizTotal,
    });

    if (wrongMeaningItems.length > 0) {
      startMeaningMistakeReplay(wrongMeaningItems);
      return;
    }

    if (wrongQuizItems.length > 0) {
      startQuizMistakeReplay(wrongQuizItems);
      return;
    }

    finishReplayAndReturn();
  }

  // display final scores
  const displayFinalScore = finalScore ?? quizScore;
  const quizMax = quizQuestions.length || 1;

  // matching/meaning score now uses meaningScore
  const matchingScore = meaningScore;
  const matchingMax = L.words.length; 


  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
      minHeight: "100vh", padding: isSmallScreen ? "10px" : "20px", paddingTop: isSmallScreen ? "12px" : "20px",
      fontFamily: "sans-serif", textAlign: "center", backgroundColor: "#e5e7eb", color: "#10203b",
    }}>

      <style>{`
        @keyframes floatUp {
          0% { opacity: 0; transform: translateY(0) scale(0.85) rotate(0deg); }
          20% { opacity: 1; }
          100% { transform: translateY(-120vh) scale(1) rotate(180deg); opacity: 0; }
        }

        /* wrapper は必ず左右の余白を作る */
        .breadcrumb-wrapper {
          padding: 0 16px;      /* 画面端の余白（必要なら 20px 等に調整） */
          box-sizing: border-box;
          width: 100%;
          margin-bottom: 14px;
        }

        /* 実際の breadcrumb */
        .breadcrumb {
          width: 100%;
          max-width: 900px;     /* 中央寄せの最大幅 */
          margin: 0 auto;
          display: flex;
          align-items: center;
          flex-wrap: nowrap;
          gap: 6px;             /* ボタン間の最小間隔 */
          overflow-x: auto;     /* 非表示になるよりスクロールさせる */
          -webkit-overflow-scrolling: touch;
          padding: 0 8px;       /* ボタン群の内側余白（左右に少し） */
          box-sizing: border-box;
        }

        /* ボタンは折り畳まれず、見切れにくくする */
        .breadcrumb button {
          background: rgba(255, 255, 255, 0.72);
          border: 1px solid rgba(148, 163, 184, 0.36);
          border-radius: 999px;
          cursor: pointer;
          font-size: 13px;
          padding: 6px 8px;     /* タップしやすいパディング */
          white-space: nowrap;
          flex: 0 0 auto;       /* 横方向に縮みすぎない */
          min-width: 0;         /* テキストに合わせるが overflow を防止 */
        }

        /* 矢印（→） */
        .breadcrumb .arrow {
          color: #6b7280;
          margin: 0 4px;        /* 矢印とボタンの間隔を小さめに */
          flex: 0 0 auto;
        }

        /* モバイル（小さい画面）用 */
        @media (max-width: 600px) {
          .breadcrumb-wrapper { padding: 0 12px; margin-bottom: 10px; }   /* さらに狭く */
          .breadcrumb { gap: 4px; padding: 0 6px; }
          .breadcrumb button { font-size: 11px; padding: 4px 6px; }
          .breadcrumb .arrow { margin: 0 3px; }
          /* 必要ならスクロールバー非表示（見栄え） */
          .breadcrumb::-webkit-scrollbar { height: 6px; }
        }


      `}</style>

      <button
        onClick={() => { if (genreFolder) nav(`/learn/${genreFolder}`); else nav('/learn'); }}
        style={{
          marginBottom: isSmallScreen ? 10 : 14,
          padding: isSmallScreen ? "11px 16px" : "12px 22px",
          borderRadius: 999,
          border: "1px solid rgba(29, 78, 216, 0.18)",
          background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 45%, #cffafe 100%)",
          color: "#12366d",
          fontWeight: 800,
          cursor: "pointer",
          boxShadow: "0 10px 20px rgba(29, 78, 216, 0.14)",
        }}
      >
        レッスン一覧に戻る
      </button>

      

      {step !== totalWords + 3 && !isReplayMode && (
        <div className="breadcrumb-wrapper" style={{ padding: isSmallScreen ? "0 12px" : "0 16px" }}>
          <div
            className="breadcrumb"
            style={{
              maxWidth: 900,
              margin: "0 auto",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {(isSmallScreen
                ? ["単語スライド", "意味マッチング", "例文穴埋め"]
                : ["単語スライド", "単語・意味マッチング", "例文穴埋め"]
              ).map((t, i) => {
                const cur =
                  (isSlide && i === 0) ||
                  (step === totalWords + 1 && i === 1) ||
                  (step === totalWords + 2 && i === 2);
                const canNavigate = i !== 2;
                return (
                  <React.Fragment key={t}>
                    <button
                      onClick={() => {
                        if (!canNavigate) return;
                        if (i === 0) setStep(1);
                        else if (i === 1) setStep(totalWords + 1);
                      }}
                      aria-disabled={!canNavigate}
                      style={{
                        fontWeight: cur ? 800 : 400,
                        color: cur ? "#1d4ed8" : "#475569",
                        background: cur ? "#dbeafe" : "rgba(255,255,255,0.72)",
                        cursor: canNavigate ? "pointer" : "default",
                        opacity: canNavigate || cur ? 1 : 0.65,
                      }}
                    >
                      {t}
                    </button>

                    {i < 2 && (
                      <span className="arrow" aria-hidden="true">→</span>
                    )}
                  </React.Fragment>
                );
            })}
          </div>
        </div>
      )}



      {/* Start screen */}
      {step === 0 && (
        <div style={panelStyle}>
              <div style={{ fontSize: headingSize, marginBottom: isSmallScreen ? 8 : 14, color: "#0f2f5f" }}>
                <strong>
                  {`今日の単語${lessonNumber && Number.isFinite(lessonNumber) ? ` (Lesson ${lessonNumber})` : ""}`}
                </strong>
              </div>
          <div style={{ fontWeight: 900, fontSize: wordListSize, marginBottom: isSmallScreen ? 12 : 18, color: "#173a71", lineHeight: 1.35 }}>
            {lesson.words.slice(0, 10).map((w: LessonWord, i: number) =>
              i < lesson.words.slice(0, 10).length - 1 ? `${w.word}, ` : w.word
            )}
          </div>

          <div style={{ marginBottom: isSmallScreen ? 8 : 12, textAlign: isSmallScreen ? "left" : "center" }}>
            <p style={{ color: "#334155", fontSize: paragraphFontSize, lineHeight: 1.75, margin: 0 }}>
              このレッスンは「単語スライド → 単語・意味マッチング → 例文穴埋め」の流れで進みます。
              英単語はなるべく日本語に訳さず、<strong>英語の定義や例文から意味を理解すること</strong>を意識しましょう。
              各単語スライドではぜひ音読してみましょう！
            </p>
          </div>

          <div className="start-buttons" style={{ display: "flex", justifyContent: "center", gap: isSmallScreen ? 8 : 12, flexWrap: "wrap" }}>
            <button onClick={() => setStep(1)} style={blueButtonStyle}>単語スライドから始める</button>
            <button onClick={() => setStep(totalWords + 1)} style={{ ...mediumBlueButtonStyle, marginTop: isSmallScreen ? 4 : 12 }}>
              単語・意味マッチングへ進む
            </button>
          </div>
        </div>
      )}

      {/* Word slides */}
      {isSlide && (
        <div style={panelStyle}>

          <h2
            className="slide-heading"
            style={{
              fontSize: headingSize,
              marginTop: isSmallScreen ? 0 : 12,
              marginBottom: isSmallScreen ? 2 : 10,
              textAlign: "center",
              color: "#0f2f5f",
            }}
          >
            単語スライド
          </h2>

          <p
            className="main-word"
            style={{
              fontSize: mainWordSize,
              fontWeight: 900,
              marginBottom: isSmallScreen ? 2 : 12,
              textAlign: "center",
              color: "#173a71",
            }}
          >
            {lesson.words[slideStep].word}
          </p>

          <p
            style={{
              fontSize: paragraphFontSize,
              lineHeight: "1.4",
              textAlign: isSmallScreen ? "left" : "center",
              marginBottom: isSmallScreen ? 6 : 12,
              color: "#1f2937",
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 16,
              padding: isSmallScreen ? 12 : 18,
            }}
          >
            <strong>意味:</strong> {lesson.words[slideStep].meaning}<br />
            <strong>日本語:</strong> {lesson.words[slideStep].japaneseMeaning || "なし"}<br />
            <strong>類義語:</strong> {lesson.words[slideStep].synonyms || "なし"}<br />
            <strong>対義語:</strong> {lesson.words[slideStep].antonyms || "なし"}<br />
            <strong>例文:</strong> {lesson.words[slideStep].example || "なし"}
          </p>

          <div
            className="audio-next-row"
            style={{
              marginTop: isSmallScreen ? 4 : 10,
              display: "flex",
              justifyContent: "center",
              gap: isSmallScreen ? 4 : 12,
              alignItems: "center",
              flexWrap: "wrap"
            }}
          >
            <button
              onClick={() =>
                speakEnglish(
                  `${lesson.words[slideStep].word}. ${lesson.words[slideStep].example || ""}`
                )
              }
              style={{
                ...nextButtonStyle,
                background: "linear-gradient(135deg, #3aa5d6 0%, #2f67b4 100%)",
                width: isSmallScreen ? 170 : 190,
                minHeight: isSmallScreen ? 40 : 44,
                padding: isSmallScreen ? "9px 12px" : "10px 16px",
                fontSize: isSmallScreen ? 14 : 16,
              }}
            >
              ▶️ 音声を聞く
            </button>

            <div
              style={{
                fontSize: isSmallScreen ? 11 : 12,
                color: "#475569",
                textAlign: "center",
              }}
            >
              音読してみましょう — 記憶に残りやすくなります。
            </div>
          </div>

          <div
            className="prev-next-row"
            style={{
              display: "flex",
              justifyContent: "center",
              gap: isSmallScreen ? 6 : 12,
              marginTop: isSmallScreen ? 6 : 16
            }}
          >
            <button
              onClick={() => setStep(step - 1)}
              style={{
                ...mutedButtonStyle,
                width: isSmallScreen ? 130 : nextButtonStyle.width
              }}
            >
              前へ
            </button>

            <button
              onClick={() => setStep(step + 1)}
              style={{
                ...blueButtonStyle,
                width: isSmallScreen ? 130 : blueButtonStyle.width
              }}
            >
              {slideStep + 1 < totalWords ? "次の単語へ" : "単語・意味マッチングへ"}
            </button>
          </div>

        </div>
      )}


      {/* Meaning MCQ step (replaces original matching UI) */}
      {step === totalWords + 1 && (
        <div style={panelStyle}>
          <h2 style={{ fontSize: headingSize2, marginBottom: 8, color: "#0f2f5f" }}>単語・意味マッチング（3択）</h2>
          <p style={{ fontSize: isSmallScreen ? 14 : 20, color: "#334155", marginTop: 1 }}>表示される意味に対応する単語を選んでください</p>

          {meaningLoading ? <p>問題を作成中...</p> : meaningError ? (
            <div>
              <p>問題の作成に失敗しました。</p>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button onClick={() => { setMeaningError(false); setStep(totalWords + 2); }} style={mediumBlueButtonStyle}>次の問題へ</button>
              </div>
            </div>
          ) : meaningQuestions.length === 0 ? (
            <div>
              <p>問題が見つかりません。</p>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button onClick={() => setStep(totalWords + 2)} style={mediumBlueButtonStyle}>次へ</button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: quizTextSize, marginBottom: 16, textAlign: "center", color: "#111827", lineHeight: 1.55, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16, padding: isSmallScreen ? 12 : 18 }}>{meaningQuestions[meaningIndex].prompt}</p>

              <div style={{ display: "grid", gridTemplateColumns: isSmallScreen ? "1fr" : "repeat(3, 1fr)", gap: 12, alignItems: "stretch" }}>
                {meaningQuestions[meaningIndex].choices.map((c: string, i: number) => {
                  const isHovered = hoveredMeaningChoice === i && meaningSelectedChoice === null && !isTouchDevice;
                  const isCorrect = meaningSelectedChoice !== null && i === meaningQuestions[meaningIndex].answer_index;
                  const isWrongSelected = meaningSelectedChoice !== null && i === meaningSelectedChoice && i !== meaningQuestions[meaningIndex].answer_index;

                  let background = choiceButtonBackground;
                  let boxShadow = choiceButtonShadow;
                  let transform = isHovered ? "translateY(-6px)" : "translateY(0)";
                  if (meaningSelectedChoice === null) {
                    if (isHovered) boxShadow = "0 8px 20px rgba(0,0,0,0.12)";
                  } else {
                    if (isCorrect) { background = "linear-gradient(90deg,#34d399,#16a34a)"; boxShadow = "0 12px 30px rgba(16,185,129,0.18)"; transform = "translateY(-4px) scale(1.02)"; }
                    else if (isWrongSelected) { background = "linear-gradient(90deg,#ff7a7a,#ff4d4d)"; boxShadow = "0 12px 30px rgba(255,99,71,0.18)"; transform = "translateY(-2px) scale(0.99)"; }
                    else { background = "linear-gradient(90deg,#f8fafc,#e6eefc)"; boxShadow = "none"; transform = "translateY(0)"; }
                  }

                  return (
                    <button key={i} onClick={() => handleMeaningChoose(i)} onMouseEnter={() => setHoveredMeaningChoice(i)} onMouseLeave={() => setHoveredMeaningChoice(null)}
                      style={{
                        fontSize: isSmallScreen ? 16 : 18, padding: isSmallScreen ? "12px 10px" : "14px 16px", width: "100%",
                        background, color: meaningSelectedChoice !== null ? (isCorrect ? "#052e16" : isWrongSelected ? "#330000" : "#0f172a") : "#fff",
                        boxShadow, transform, transition: "transform 0.18s ease, box-shadow 0.2s ease, background 0.25s ease", border: "none", cursor: meaningSelectedChoice !== null ? "default" : "pointer",
                        borderRadius: 16, display: "flex", gap: 12, alignItems: "center", justifyContent: "center", textAlign: "left", fontWeight: 800,
                      }} disabled={meaningSelectedChoice !== null}>
                      <div style={{ minWidth: 40, textAlign: "center", fontSize: 18, fontWeight: 800 }}>{` ${i + 1}`}</div>
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontWeight: 700 }}>{c}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {meaningSelectedChoice !== null && (
                <div style={{ marginTop: 6, display: "flex", justifyContent: "center" }}>
                  <div style={{ fontSize: isSmallScreen ? 14 : 24, fontWeight: 700, color: meaningSelectedChoice === meaningQuestions[meaningIndex].answer_index ? "green" : "red" }}>
                    {meaningSelectedChoice === meaningQuestions[meaningIndex].answer_index ? "correct!" : "Nice try！"}
                  </div>
                </div>
              )}


              {meaningSelectedChoice !== null && (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button
                    onClick={() => {
                      if (meaningIndex + 1 < meaningQuestions.length) {
                        setMeaningIndex(meaningIndex + 1);
                        setMeaningSelectedChoice(null);
                      } else if (isReplayMode && replayType === "meaning") {
                        if (wrongQuizItems.length > 0) {
                          startQuizMistakeReplay(wrongQuizItems);
                        } else {
                          finishReplayAndReturn();
                        }
                      } else {
                        setStep(totalWords + 2);
                      }
                    }}
                    style={
                      meaningIndex + 1 < meaningQuestions.length
                        ? { ...nextButtonStyle, marginTop: 12 } // 「次の問題へ」の時
                        : { ...blueButtonStyle, marginTop: isSmallScreen ? 12 : 16 }
                    }
                  >
                    {meaningIndex + 1 < meaningQuestions.length
                      ? "次の問題へ"
                      : isReplayMode && replayType === "meaning"
                        ? wrongQuizItems.length > 0
                          ? "例文穴埋めの復習へ"
                          : "復習を終了する"
                        : "例文穴埋めクイズへ"}
                  </button>

                </div>
              )}

              <p style={{ marginTop: 12, fontSize: 14, color: "#475569" }}>
                {meaningIndex + 1} / {meaningQuestions.length}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Quiz */}
      {step === totalWords + 2 && (
        <div style={panelStyle}>
          <h2 style={{ fontSize: headingSize2, marginBottom: 8, color: "#0f2f5f" }}>例文穴埋めクイズ（3択）</h2>
          <p style={{ fontSize: isSmallScreen ? 14 : 20, color: "#334155", marginTop: 1 }}>空欄に入るもっとも適切な単語を選んでください</p>

          {quizLoading ? <p>クイズを読み込み中...</p> : quizError ? (
            <div>
              <p>クイズの作成に失敗しました。</p>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button onClick={() => { setFinalScore(0); setStep(totalWords + 3); }} style={mediumBlueButtonStyle}>採点へ</button>
              </div>
            </div>
          ) : quizQuestions.length === 0 ? (
            <div>
              <p>クイズが見つかりません。</p>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button onClick={() => { setFinalScore(0); setStep(totalWords + 3); }} style={mediumBlueButtonStyle}>採点へ</button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: quizTextSize, marginBottom: 16, textAlign: "center", color: "#111827", lineHeight: 1.55, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16, padding: isSmallScreen ? 12 : 18 }}>
                <span dangerouslySetInnerHTML={{ __html: quizQuestions[quizIndex].blank_sentence }} />
              </p>

              <div style={{ display: "grid", gridTemplateColumns: isSmallScreen ? "1fr" : "repeat(3, 1fr)", gap: 12, alignItems: "stretch" }}>
                {quizQuestions[quizIndex].choices.map((c: string, i: number) => {
                  const isHovered = hoveredQuizChoice === i && selectedChoice === null && !isTouchDevice;
                  const isCorrect = selectedChoice !== null && i === quizQuestions[quizIndex].answer_index;
                  const isWrongSelected = selectedChoice !== null && i === selectedChoice && i !== quizQuestions[quizIndex].answer_index;

                  let background = choiceButtonBackground;
                  let boxShadow = choiceButtonShadow;
                  let transform = isHovered ? "translateY(-6px)" : "translateY(0)";
                  if (selectedChoice === null) {
                    if (isHovered) boxShadow = "0 8px 20px rgba(0,0,0,0.12)";
                  } else {
                    if (isCorrect) { background = "linear-gradient(90deg,#34d399,#16a34a)"; boxShadow = "0 12px 30px rgba(16,185,129,0.18)"; transform = "translateY(-4px) scale(1.02)"; }
                    else if (isWrongSelected) { background = "linear-gradient(90deg,#ff7a7a,#ff4d4d)"; boxShadow = "0 12px 30px rgba(255,99,71,0.18)"; transform = "translateY(-2px) scale(0.99)"; }
                    else { background = "linear-gradient(90deg,#f8fafc,#e6eefc)"; boxShadow = "none"; transform = "translateY(0)"; }
                  }

                  return (
                    <button key={i} onClick={() => handleChoose(i)} onMouseEnter={() => setHoveredQuizChoice(i)} onMouseLeave={() => setHoveredQuizChoice(null)}
                      style={{
                        fontSize: isSmallScreen ? 16 : 18, padding: isSmallScreen ? "12px 10px" : "14px 16px", width: "100%",
                        background, color: selectedChoice !== null ? (isCorrect ? "#052e16" : isWrongSelected ? "#330000" : "#0f172a") : "#fff",
                        boxShadow, transform, transition: "transform 0.18s ease, box-shadow 0.2s ease, background 0.25s ease", border: "none", cursor: selectedChoice !== null ? "default" : "pointer",
                        borderRadius: 16, display: "flex", gap: 12, alignItems: "center", justifyContent: "center", textAlign: "left", fontWeight: 800,
                      }} disabled={selectedChoice !== null}>
                      <div style={{ minWidth: 40, textAlign: "center", fontSize: 18, fontWeight: 800 }}>{` ${i + 1}`}</div>
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontWeight: 700 }}>{c}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedChoice !== null && (
                <div style={{ marginTop: 6, display: "flex", justifyContent: "center" }}>
                  <div style={{ fontSize: isSmallScreen ? 14 : 24, fontWeight: 700, color: selectedChoice === quizQuestions[quizIndex].answer_index ? "green" : "red" }}>
                    {selectedChoice === quizQuestions[quizIndex].answer_index ? "correct!" : "Nice try！"}
                  </div>
                </div>
              )}

              {selectedChoice !== null && (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button
                    onClick={() => {
                      if (quizIndex + 1 < quizQuestions.length) {
                        // まだ次の問題がある
                        setQuizIndex(quizIndex + 1);
                        setSelectedChoice(null);
                      } else if (isReplayMode && replayType === "quiz") {
                        finishReplayAndReturn();
                      } else {
                        // 最後 → スコア計算 & レッスン終了画面へ
                        setFinalScore(
                          quizScore + (selectedChoice === quizQuestions[quizIndex].answer_index ? 1 : 0)
                        );
                        setStep(totalWords + 3);
                      }
                    }}
                    style={
                      quizIndex + 1 < quizQuestions.length
                        ? { ...nextButtonStyle, marginTop: 12 }    // 「次の問題へ」
                        : { ...blueButtonStyle, marginTop: isSmallScreen ? 12 : 16 }                  // 「了する」
                    }
                  >
                    {quizIndex + 1 < quizQuestions.length
                      ? "次の問題へ"
                      : isReplayMode && replayType === "quiz"
                        ? "復習を終了する"
                        : "レッスンの結果を見る"}
                  </button>
                </div>
              )}

              <p style={{ marginTop: 12, fontSize: 14, color: "#475569" }}>{quizIndex + 1} / {quizQuestions.length}</p>
            </div>
          )}
        </div>
      )}

      {/* Final summary */}
      {step === totalWords + 3 && (() => {
        const matchingAttempted = meaningAttempted || meaningQuestions.length > 0;
        const quizAttemptedFlag = quizAttempted;

        const matchingDisplayScore = matchingAttempted ? matchingScore : 0;
        const matchingDisplayMax = matchingAttempted ? matchingMax : 0;
        const matchingDisplayPercent = matchingAttempted ? Math.round((matchingScore / matchingMax) * 100) : 0;

        const quizDisplayScore = quizAttemptedFlag ? displayFinalScore : 0;
        const quizDisplayMax = quizAttemptedFlag ? quizMax : 0;
        const quizDisplayPercent = quizAttemptedFlag ? Math.round((quizDisplayScore / quizDisplayMax) * 100) : 0;

        const attemptedTotalScore = matchingDisplayScore + quizDisplayScore;
        const attemptedTotalMax = matchingDisplayMax + quizDisplayMax;
        const attemptedPercent = attemptedTotalMax ? Math.round((attemptedTotalScore / attemptedTotalMax) * 100) : 0;
        const replayTotalScore = replayResult.meaningCorrect + replayResult.quizCorrect;
        const replayTotalMax = replayResult.meaningTotal + replayResult.quizTotal;
        const replayPercent = replayTotalMax ? Math.round((replayTotalScore / replayTotalMax) * 100) : 0;
        const replayGaugePercent = Math.max(0, Math.min(100, animatedReplayPercent));
        const replayGaugeSize = isSmallScreen ? 112 : 138;
        const replayGaugeThickness = isSmallScreen ? 18 : 22;
        const replayGaugeDegrees = replayGaugePercent * 1.8;
        const replayGaugeColor =
          replayPercent >= 90
            ? "#16a34a"
            : replayPercent >= 70
              ? "#2563eb"
              : replayPercent >= 45
                ? "#f59e0b"
                : "#ef4444";

        const praise = finalPraiseMessage || getPraise(attemptedPercent);
        const gaugePercent = Math.max(0, Math.min(100, animatedPercent));
        const gaugeDegrees = gaugePercent * 1.8;
        const gaugeSize = isSmallScreen ? 220 : 280;
        const gaugeThickness = isSmallScreen ? 34 : 42;
        const gaugeColor =
          attemptedPercent >= 90
            ? "#16a34a"
            : attemptedPercent >= 70
              ? "#2563eb"
              : attemptedPercent >= 45
                ? "#f59e0b"
                : "#ef4444";

        return (
          <div
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
              flexDirection: "column",
              textAlign: "center",
              paddingTop: "40px",
              paddingLeft: isSmallScreen ? "10px" : "0",
              paddingRight: isSmallScreen ? "10px" : "0",
              boxSizing: "border-box",
              overflowX: "hidden",
            }}
          >
            <div
              style={{
                ...panelStyle,
                maxWidth: isSmallScreen ? "100%" : 900,
                margin: isSmallScreen ? "0" : "0 auto",
              }}
            >
              <h2
                style={{
                  fontSize: headingSize,
                  marginBottom: 12,
                  color: "#0f2f5f",
                }}
              >
                {`レッスン合計スコア${lessonNumber && Number.isFinite(lessonNumber) ? ` (Lesson ${lessonNumber})` : ""}`}
              </h2>

              <div style={{ fontSize: paragraphFontSize, marginBottom: 12, color: "#1f2937" }}>
                <p>単語・意味マッチング: {matchingDisplayScore} / {matchingDisplayMax} ({matchingDisplayPercent}%)</p>
                <p>例文穴埋めクイズ: {quizDisplayScore} / {quizDisplayMax} ({quizDisplayPercent}%)</p>
                <hr style={{ margin: "16px 0", border: 0, borderTop: "1px solid #e2e8f0" }} />

                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "flex-end",
                    gap: isSmallScreen ? 12 : 22,
                    margin: isSmallScreen ? "8px auto 14px" : "12px auto 18px",
                    transform: replayResult.completed && replayTotalMax > 0 && !isSmallScreen ? "translateX(-18px)" : "none",
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    aria-label={`正答率 ${attemptedPercent}%`}
                    style={{
                      width: gaugeSize,
                      maxWidth: "100%",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        width: gaugeSize,
                        maxWidth: "100%",
                        height: gaugeSize / 2,
                        overflow: "hidden",
                        position: "relative",
                        margin: "0 auto",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          width: gaugeSize,
                          height: gaugeSize,
                          borderRadius: "50%",
                          background: `conic-gradient(from 270deg, ${gaugeColor} 0deg ${gaugeDegrees}deg, #e2e8f0 ${gaugeDegrees}deg 180deg, transparent 180deg 360deg)`,
                          boxShadow: "inset 0 0 0 1px rgba(148, 163, 184, 0.16)",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            left: gaugeThickness,
                            top: gaugeThickness,
                            width: gaugeSize - gaugeThickness * 2,
                            height: gaugeSize - gaugeThickness * 2,
                            borderRadius: "50%",
                            background: "#fff",
                            boxShadow: "inset 0 8px 18px rgba(15, 23, 42, 0.05)",
                          }}
                        />
                      </div>
                    </div>
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: isSmallScreen ? -2 : 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        lineHeight: 1.05,
                      }}
                    >
                      <span style={{ fontSize: isSmallScreen ? 12 : 14, color: "#64748b", fontWeight: 800 }}>
                        正答率
                      </span>
                      <span style={{ fontSize: isSmallScreen ? 34 : 42, color: "#173a71", fontWeight: 900 }}>
                        {gaugePercent}%
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: 4,
                        fontSize: 12,
                        color: "#64748b",
                        fontWeight: 700,
                      }}
                    >
                      <span>0%</span>
                      <span>100%</span>
                    </div>
                  </div>

                  {replayResult.completed && replayTotalMax > 0 && (
                    <div
                      style={{
                        background: "#fef3c7",
                        border: "1px solid #f59e0b",
                        borderRadius: 16,
                        padding: isSmallScreen ? "10px 12px" : "12px 16px",
                        color: "#92400e",
                        lineHeight: 1.15,
                      }}
                    >
                      <div
                        aria-label={`復習結果 ${replayPercent}%`}
                        style={{
                          width: replayGaugeSize,
                          height: replayGaugeSize / 2,
                          overflow: "hidden",
                          position: "relative",
                          margin: "0 auto 4px",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            width: replayGaugeSize,
                            height: replayGaugeSize,
                            borderRadius: "50%",
                            background: `conic-gradient(from 270deg, ${replayGaugeColor} 0deg ${replayGaugeDegrees}deg, #fde68a ${replayGaugeDegrees}deg 180deg, transparent 180deg 360deg)`,
                          }}
                        >
                          <div
                            style={{
                              position: "absolute",
                              left: replayGaugeThickness,
                              top: replayGaugeThickness,
                              width: replayGaugeSize - replayGaugeThickness * 2,
                              height: replayGaugeSize - replayGaugeThickness * 2,
                              borderRadius: "50%",
                              background: "#fef3c7",
                            }}
                          />
                        </div>
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                          bottom: -1,
                          color: "#78350f",
                          fontSize: isSmallScreen ? 22 : 27,
                          fontWeight: 900,
                          textAlign: "center",
                        }}
                      >
                          {replayGaugePercent}%
                        </div>
                      </div>
                      <div style={{ fontSize: isSmallScreen ? 14 : 16, fontWeight: 800 }}>
                        復習結果<br />
                        {replayTotalScore} / {replayTotalMax}
                      </div>
                    </div>
                  )}
                </div>

                <p style={{ fontSize: isSmallScreen ? 20 : 24, fontWeight: 900, color: "#173a71" }}>
                  合計: {attemptedTotalScore} / {attemptedTotalMax}
                </p>
                <p style={{ fontSize: isSmallScreen ? 15 : 18, marginTop: 8, color: "#334155", lineHeight: 1.6 }}>
                  {praise}
                </p>
                {progressSubmitError && (
                  <p style={{ fontSize: 13, color: "#b45309", marginTop: 8 }}>
                    学習記録の保存に失敗しました。レッスンの結果表示には影響ありません。
                  </p>
                )}
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
                {(wrongMeaningItems.length > 0 || wrongQuizItems.length > 0) && (
                  <button
                    onClick={() => replayMistakes()}
                    style={{ ...blueButtonStyle, background: "linear-gradient(135deg, #d97706 0%, #f59e0b 55%, #fbbf24 100%)" }}
                  >
                    間違えた問題をもう一度解く
                  </button>
                )}

                <button 
                 onClick={() => { if (genreFolder) nav(`/learn/${genreFolder}`); else nav('/learn'); }}
                 style={blueButtonStyle}>
                  レッスンを終了し、一覧ページに戻る
                </button>

              <button
                onClick={() => goToNextLesson()}
                style={{ ...blueButtonStyle, background: "linear-gradient(135deg, #16a34a 0%, #22c55e 55%, #14b8a6 100%)" }}
              >
                {`次のレッスン${
                  lessonNumber && Number.isFinite(lessonNumber)
                    ? ` (Lesson ${lessonNumber + 1})`
                    : ""
                } に進む`}
              </button>


              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
};

function parseLessonId(lessonId: string): { genre: string; lessonNumber: number | null } | null {
  if (!lessonId.includes("-lesson-")) return null;
  const [genre, rawLessonNumber] = lessonId.split("-lesson-");
  if (!genre) return null;
  const lessonNumber = parseInt(rawLessonNumber, 10);
  return {
    genre,
    lessonNumber: Number.isFinite(lessonNumber) ? lessonNumber : null,
  };
}

function getOrCreateAnonymousUserId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const storageKey = "vocabstream_anonymous_user_id";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;

  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  window.localStorage.setItem(storageKey, generated);
  return generated;
}

/* generateQuizFromLesson (unchanged except location) */
function generateQuizFromLesson(lesson: LessonData): QuizQuestion[] {
  const words: LessonWord[] = lesson.words || [];
  // build a pool of unique words (dedupe by word) to avoid duplicated questions
  const rawPool = words.filter((w: LessonWord) => w.word).map((w: LessonWord) => ({ word: w.word, example: w.example || "" }));
  const mapByWord = new Map<string, { word: string; example: string }>();
  for (const p of rawPool) mapByWord.set(p.word, p);
  const pool = Array.from(mapByWord.values());
  if (pool.length < 3) throw new Error("not enough words for quiz");
  function sample<T>(arr: T[], k: number): T[] {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, k);
  }
  const questions: QuizQuestion[] = [];
  for (const item of pool) {
    const correct = item.word;
    const otherWords: string[] = pool.map((p: { word: string }) => p.word).filter((w: string) => w !== correct);
    const distractors = sample(otherWords, Math.min(2, otherWords.length));
    const choices = [...distractors, correct];
    const shuffled = sample(choices, choices.length);
    const answer_index = shuffled.indexOf(correct);
    let blank_sentence = item.example || "";
    if (blank_sentence) {
      const re = new RegExp(correct.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), "i");
      if (re.test(blank_sentence)) blank_sentence = blank_sentence.replace(re, "____");
      else {
        const cap = correct.charAt(0).toUpperCase() + correct.slice(1);
        const re2 = new RegExp(cap.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), "i");
        if (re2.test(blank_sentence)) blank_sentence = blank_sentence.replace(re2, "____");
        else blank_sentence = "____ " + blank_sentence;
      }
    } else blank_sentence = "____";
    questions.push({ word: correct, sentence: item.example || "", blank_sentence, choices: shuffled, answer_index });
  }
  for (let i = questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }
  return questions;
}

// generateMeaningQuizFromLesson: create MCQ where prompt is meaning and choices are words (one correct + two distractors)
function generateMeaningQuizFromLesson(lesson: LessonData): MeaningQuestion[] {
  const words: LessonWord[] = lesson.words || [];
  // build pool and dedupe by word to prevent duplicated meaning questions
  const rawPool = words.map((w, i) => ({ word: w.word, meaning: w.meaning || w.japaneseMeaning || "", originalIndex: i }));
  const seen = new Map<string, { word: string; meaning: string; originalIndex: number }>();
  for (const p of rawPool) {
    if (!p.word) continue;
    if (!seen.has(p.word)) seen.set(p.word, p);
  }
  const pool = Array.from(seen.values());
  // filter out entries without a meaning or word
  const usable = pool.filter(p => p.word && p.meaning);
  if (usable.length === 0) return [];

  function sample<T>(arr: T[], k: number): T[] {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, k);
  }

  const questions: MeaningQuestion[] = [];
  for (const item of usable) {
    const correct = item.word;
    const otherWords: string[] = usable.map(u => u.word).filter(w => w !== correct);
    const distractors = sample(otherWords, Math.min(2, otherWords.length));
    const choices = [...distractors, correct];
    const shuffled = sample(choices, choices.length);
    const answer_index = shuffled.indexOf(correct);
    questions.push({ originalIndex: item.originalIndex, prompt: item.meaning, choices: shuffled, answer_index });
  }

  // shuffle final question order
  for (let i = questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }
  return questions;
}

export default Lesson;
