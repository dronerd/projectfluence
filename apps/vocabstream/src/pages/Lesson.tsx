import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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

  // responsive / touch state
  const [isSmallScreen, setIsSmallScreen] = useState<boolean>(false);
  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(false);

  // finish lock/overlay to avoid duplicate praise
  const [finishLock, setFinishLock] = useState<boolean>(false);

  // audio context ref for playing chime
  const audioCtxRef = useRef<AudioContext | null>(null);

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
  }, [step, lesson]);

  // prepare meaning-mcq when entering matching step
  useEffect(() => {
    if (!lesson) return;
    const totalWords = lesson.words ? lesson.words.length : 0;
    const matchingStep = totalWords + 1; // this step will now be meaning MCQ
    if (step === matchingStep) {
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
  }, [step, lesson]);

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

  if (!lesson) return <div>Loading lesson...</div>;
  const L = lesson!;
  const totalWords = L.words.length;
  const slideStep = step - 1;
  const isSlide = step > 0 && slideStep < totalWords;

  // derive genre folder and lesson number from lessonId like "business-lesson-1"
  const genreFolder = lessonId && lessonId.includes("-lesson-") ? lessonId.split("-lesson-")[0] : null;
  const lessonNumber = lessonId && lessonId.includes("-lesson-") ? parseInt(lessonId.split("-lesson-")[1], 10) : null;

  // getPraise unchanged
  function getPraise(percent: number): string {
    if (!Number.isFinite(percent)) percent = 0;
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;
    const messages = {
      low: ["よく頑張りました！次はもう少し覚えましょう。", "一歩ずつ前進しています。諦めずに続けましょう！", "努力のスタートラインに立ちました！ここから伸びます！"],
      midLow: ["順調です！継続が力になります。", "確実に力がついてきています！", "いい流れです。小さな進歩を積み重ねていきましょう！"],
      mid: ["いい調子です！あとひと息です！", "素晴らしい成長です！もう少しで大きな成果に届きます！", "この調子で勢いをキープしましょう！"],
      high: ["とてもよくできました！", "かなりの理解度です！自信を持っていきましょう！", "集中力が素晴らしいです！この調子！"],
      nearPerfect: ["素晴らしい、ほぼ完璧です！", "すごい完成度！最後のひと押しです！", "努力の成果が出ています！もう一歩で完全制覇！"],
      perfect: ["完璧です！おめでとうございます！", "すごすぎる！努力の結晶です！", "あなたの頑張りが最高の結果を生みました！"],
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
  const paragraphFontSize = isSmallScreen ? 14 : 20;
  const quizTextSize = isSmallScreen ? 16 : 28;
  const buttonFontSize = isSmallScreen ? 15 : 24; // slightly smaller on mobile
  const buttonWidth = isSmallScreen ? "100%" : 360;
  const blueButtonStyle: React.CSSProperties = {
    fontSize: buttonFontSize, padding: isSmallScreen ? "8px 10px" : "10px 20px", marginTop: 12,
    backgroundColor: "#003366", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", width: buttonWidth,
  };
  const nextButtonStyle: React.CSSProperties = { ...blueButtonStyle, width: isSmallScreen ? "100%" : 240, backgroundColor: "#003366" };

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

  // --- quiz choice handler (example-sentence quiz) ---
  async function handleChoose(choiceIndex: number) {
    if (!quizQuestions[quizIndex] || selectedChoice !== null) return;

    await unlockAudio();

    const q = quizQuestions[quizIndex];
    const isCorrect = choiceIndex === q.answer_index;
    setSelectedChoice(choiceIndex);
    setQuizAttempted(true);
    if (isCorrect) {
      setQuizScore((s) => s + 1);
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
    setMeaningSelectedChoice(choiceIndex);
    setMeaningAttempted(true);
    if (isCorrect) {
      setMeaningScore((s) => s + 1);
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
    setIsReplayMode(false);
    setReplayType(null);
    setStep(0); // 例：トップ or summary
  }
  
  // Replay mistakes: filter meaningQuestions and quizQuestions to include only previously-wrong items
  function replayMistakes() {
    // compute the step numbers used elsewhere in this component
    const matchingStep = totalWords + 1; // meaning-mcq screen
    const quizStep = totalWords + 2;     // example-sentence quiz screen

    // 優先順位: まず意味問題の間違いがあればそれを再生
    if (wrongMeaningItems.length > 0) {
      setMeaningQuestions(wrongMeaningItems.slice()); // wrong items を問題セットとして使う
      setMeaningIndex(0);
      setMeaningScore(0);
      setMeaningSelectedChoice(null);
      setMeaningAttempted(false);

      setIsReplayMode(true);
      setReplayType("meaning");

      // finalScore が残っていると混乱するためクリア（任意）
      setFinalScore(null);

      // 正しい step 値へ移動（totalWords + 1）
      setStep(matchingStep);
      return;
    }

    // 次に例文クイズの間違いがあればそれを再生
    if (wrongQuizItems.length > 0) {
      setQuizQuestions(wrongQuizItems.slice());
      setQuizIndex(0);
      setQuizScore(0);
      setSelectedChoice(null);
      setQuizAttempted(false);

      setIsReplayMode(true);
      setReplayType("quiz");

      setFinalScore(null);

      // 正しい step 値へ移動（totalWords + 2）
      setStep(quizStep);
      return;
    }

    // 間違いが無ければ何もしない（必要なら通知を出す）
    // alert("間違えた問題はありません。");
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
      minHeight: "100vh", padding: isSmallScreen ? "10px" : "20px", paddingTop: isSmallScreen ? "56px" : "92px",
      fontFamily: "sans-serif", textAlign: "center",
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
          background: transparent;
          border: none;
          cursor: pointer;
          font-size: 13px;
          padding: 6px 8px;     /* タップしやすいパディング */
          white-space: nowrap;
          flex: 0 0 auto;       /* 横方向に縮みすぎない */
          min-width: 0;         /* テキストに合わせるが overflow を防止 */
        }

        /* 矢印（→） */
        .breadcrumb .arrow {
          color: #bbb;
          margin: 0 4px;        /* 矢印とボタンの間隔を小さめに */
          flex: 0 0 auto;
        }

        /* モバイル（小さい画面）用 */
        @media (max-width: 600px) {
          .breadcrumb-wrapper { padding: 0 12px; }   /* さらに狭く */
          .breadcrumb { gap: 4px; padding: 0 6px; }
          .breadcrumb button { font-size: 11px; padding: 4px 6px; }
          .breadcrumb .arrow { margin: 0 3px; }
          /* 必要ならスクロールバー非表示（見栄え） */
          .breadcrumb::-webkit-scrollbar { height: 6px; }
        }


      `}</style>

      <button onClick={() => { if (genreFolder) nav(`/learn/${genreFolder}`); else nav('/learn'); }} style={{ marginBottom: isSmallScreen ? 10 : 12, padding: isSmallScreen ? "12px 12px" : (isSmallScreen ? "8px 10px" : "10px 6px"), borderRadius: 10, border: "none", backgroundColor: "#555", color: "#fff", cursor: "pointer" }}>
        レッスン一覧に戻る
      </button>

      

      {/* Breadcrumb Wrapper */}
      <div className="breadcrumb-wrapper" style={{ padding: isSmallScreen ? "0 12px" : "0 16px" }}>
        <div
          className="breadcrumb"
          /* inline fallback props kept minimal */
          style={{
            maxWidth: 900,
            margin: "0 auto",         // centers the div horizontally
            display: "flex",          // make contents a row
            justifyContent: "center", // center buttons inside
            alignItems: "center",     // vertical alignment if needed
            gap: "8px",               // space between buttons/arrows
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
              return (
                <React.Fragment key={t}>
                <button
                  onClick={() => {
                    if (i === 0) setStep(1);
                    else if (i === 1) setStep(totalWords + 1);
                    else if (i === 2) setStep(totalWords + 2);
                  }}
                  style={{
                    fontWeight: cur ? 800 : 400,
                    color: cur ? "#000" : "#666",
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



      {/* Start screen */}
      {step === 0 && (
        <div style={{ width: "100%", maxWidth: 900 }}>
              <div style={{ fontSize: headingSize, marginBottom: isSmallScreen ? 6 : 12 }}>
                <strong>
                  {`今日の単語${lessonNumber && Number.isFinite(lessonNumber) ? ` (Lesson ${lessonNumber})` : ""}`}
                </strong>
              </div>
          <div style={{ fontWeight: "bold", fontSize: wordListSize, marginBottom: isSmallScreen ? 8 : 12 }}>
            {lesson.words.slice(0, 10).map((w: LessonWord, i: number) =>
              i < lesson.words.slice(0, 10).length - 1 ? `${w.word}, ` : w.word
            )}
          </div>

          <div style={{ marginBottom: isSmallScreen ? 8 : 12, textAlign: isSmallScreen ? "left" : "center" }}>
            <p style={{ color: "#333", fontSize: paragraphFontSize }}>
              このレッスンは「単語スライド → 単語・意味マッチング → 例文穴埋め」の流れで進みます。<br />
              英単語はなるべく日本語に訳さず、<strong>英語の定義や例文から意味を理解すること</strong>を意識しましょう。<br />
              各単語スライドではぜひ音読してみましょう！
            </p>
          </div>

          <div className="start-buttons" style={{ display: "flex", justifyContent: "center", gap: isSmallScreen ? 4 : 12, flexWrap: "wrap" }}>
            <button onClick={() => setStep(1)} style={blueButtonStyle}>単語スライドから始める</button>
            <button onClick={() => setStep(totalWords + 1)} style={{ fontSize: buttonFontSize, padding: isSmallScreen ? "8px 12px" : "10px 20px", marginTop: isSmallScreen ? 4 : 16, backgroundColor: "#1a4e8a", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", width: buttonWidth }}>
              単語・意味マッチングへ進む
            </button>
            <button onClick={() => setStep(totalWords + 2)} style={{ fontSize: buttonFontSize, padding: isSmallScreen ? "8px 12px" : "10px 20px", marginTop: isSmallScreen ? 4 : 16, backgroundColor: "#1a4e8a", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", width: buttonWidth }}>
              例文穴埋めへ進む
            </button>
          </div>
        </div>
      )}

      {/* Word slides */}
      {isSlide && (
        <div style={{ width: "100%", maxWidth: 900 }}>

          <h2
            className="slide-heading"
            style={{
              fontSize: headingSize,
              marginTop: isSmallScreen ? 0 : 12,
              marginBottom: isSmallScreen ? 2 : 10,
              textAlign: "center"
            }}
          >
            単語スライド
          </h2>

          <p
            className="main-word"
            style={{
              fontSize: mainWordSize,
              fontWeight: "bold",
              marginBottom: isSmallScreen ? 2 : 12,
              textAlign: "center"
            }}
          >
            {lesson.words[slideStep].word}
          </p>

          <p
            style={{
              fontSize: paragraphFontSize,
              lineHeight: "1.4",
              textAlign: isSmallScreen ? "left" : "center",
              marginBottom: isSmallScreen ? 6 : 12
            }}
          >
            <strong>意味:</strong> {lesson.words[slideStep].meaning}<br />
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
                backgroundColor: "#6fa8dc",
                width: isSmallScreen ? 170 : undefined,
                padding: isSmallScreen ? "6px 8px" : undefined,
                fontSize: isSmallScreen ? 13 : nextButtonStyle.fontSize
              }}
            >
              ▶️ 音声を聞く
            </button>

            <div
              style={{
                fontSize: isSmallScreen ? 11 : 12,
                color: "#444",
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
                ...nextButtonStyle,
                backgroundColor: "#999",
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
        <div style={{ width: "100%", maxWidth: 900 }}>
          <h2 style={{ fontSize: headingSize2, marginBottom: 8 }}>単語・意味マッチング（3択）</h2>
          <p style={{ fontSize: isSmallScreen ? 12 : 20, color: "black", marginTop: 1 }}>表示される意味に対応する単語を選んでください</p>

          {meaningLoading ? <p>問題を作成中...</p> : meaningError ? (
            <div>
              <p>問題の作成に失敗しました。</p>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button onClick={() => { setMeaningError(false); setStep(totalWords + 2); }} style={blueButtonStyle}>次の問題へ</button>
              </div>
            </div>
          ) : meaningQuestions.length === 0 ? (
            <div>
              <p>問題が見つかりません。</p>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button onClick={() => setStep(totalWords + 2)} style={blueButtonStyle}>次へ</button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: quizTextSize, marginBottom: 12, textAlign: "center" }}>{meaningQuestions[meaningIndex].prompt}</p>

              <div style={{ display: "grid", gridTemplateColumns: isSmallScreen ? "1fr" : "repeat(3, 1fr)", gap: 12, alignItems: "stretch" }}>
                {meaningQuestions[meaningIndex].choices.map((c: string, i: number) => {
                  const isHovered = hoveredMeaningChoice === i && meaningSelectedChoice === null && !isTouchDevice;
                  const isCorrect = meaningSelectedChoice !== null && i === meaningQuestions[meaningIndex].answer_index;
                  const isWrongSelected = meaningSelectedChoice !== null && i === meaningSelectedChoice && i !== meaningQuestions[meaningIndex].answer_index;

                  let background = "#003366";
                  let boxShadow = "none";
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
                        fontSize: isSmallScreen ? 16 : 18, padding: isSmallScreen ? "10px 8px" : "10px 12px", width: "100%",
                        background, color: meaningSelectedChoice !== null ? (isCorrect ? "#052e16" : isWrongSelected ? "#330000" : "#0f172a") : "#fff",
                        boxShadow, transform, transition: "transform 0.18s ease, box-shadow 0.2s ease, background 0.25s ease", border: "none", cursor: meaningSelectedChoice !== null ? "default" : "pointer",
                        borderRadius: 12, display: "flex", gap: 12, alignItems: "center", justifyContent: "center", textAlign: "left",
                      }} disabled={meaningSelectedChoice !== null}>
                      <div style={{ minWidth: 40, textAlign: "center", fontSize: 18, fontWeight: 800 }}>{` ${i + 1}`}</div>
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontWeight: 700 }}>{c}</div>
                        <div style={{ fontSize: 14, color: "#fff", opacity: 0.9 }}>{i === meaningQuestions[meaningIndex].answer_index && meaningSelectedChoice !== null ? "correct!" : ""}</div>
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
                      } else {
                        setStep(totalWords + 2);
                      }
                    }}
                    style={
                      meaningIndex + 1 < meaningQuestions.length
                        ? { ...nextButtonStyle, marginTop: 12 } // 「次の問題へ」の時
                        : {                                      // 「例文へ」の時
                            fontSize: buttonFontSize,
                            padding: isSmallScreen ? "8px 12px" : "10px 20px",
                            marginTop: isSmallScreen ? 12 : 16,
                            backgroundColor: "#1a4e8a",
                            color: "#fff",
                            border: "none",
                            borderRadius: 8,
                            cursor: "pointer",
                            width: buttonWidth,
                          }
                    }
                  >
                    {meaningIndex + 1 < meaningQuestions.length
                      ? "次の問題へ"
                      : "例文穴埋めクイズへ"}
                  </button>

                </div>
              )}

              <p style={{ marginTop: 12, fontSize: 14 }}>
                {meaningIndex + 1} / {meaningQuestions.length}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Quiz */}
      {step === totalWords + 2 && (
        <div style={{ width: "100%", maxWidth: 900 }}>
          <h2 style={{ fontSize: headingSize2, marginBottom: 8 }}>例文穴埋めクイズ（3択👆）</h2>
          <p style={{ fontSize: isSmallScreen ? 12 : 20, color: "black", marginTop: 1 }}>空欄に入るもっとも適切な単語を選んでください</p>

          {quizLoading ? <p>クイズを読み込み中...</p> : quizError ? (
            <div>
              <p>クイズの作成に失敗しました。</p>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button onClick={() => { setFinalScore(0); setStep(totalWords + 3); }} style={blueButtonStyle}>採点へ</button>
              </div>
            </div>
          ) : quizQuestions.length === 0 ? (
            <div>
              <p>クイズが見つかりません。</p>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <button onClick={() => { setFinalScore(0); setStep(totalWords + 3); }} style={blueButtonStyle}>採点へ</button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: quizTextSize, marginBottom: 12, textAlign: "center" }}>
                <span dangerouslySetInnerHTML={{ __html: quizQuestions[quizIndex].blank_sentence }} />
              </p>

              <div style={{ display: "grid", gridTemplateColumns: isSmallScreen ? "1fr" : "repeat(3, 1fr)", gap: 12, alignItems: "stretch" }}>
                {quizQuestions[quizIndex].choices.map((c: string, i: number) => {
                  const isHovered = hoveredQuizChoice === i && selectedChoice === null && !isTouchDevice;
                  const isCorrect = selectedChoice !== null && i === quizQuestions[quizIndex].answer_index;
                  const isWrongSelected = selectedChoice !== null && i === selectedChoice && i !== quizQuestions[quizIndex].answer_index;

                  let background = "#003366";
                  let boxShadow = "none";
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
                        fontSize: isSmallScreen ? 16 : 18, padding: isSmallScreen ? "10px 8px" : "14px 16px", width: "100%",
                        background, color: selectedChoice !== null ? (isCorrect ? "#052e16" : isWrongSelected ? "#330000" : "#0f172a") : "#fff",
                        boxShadow, transform, transition: "transform 0.18s ease, box-shadow 0.2s ease, background 0.25s ease", border: "none", cursor: selectedChoice !== null ? "default" : "pointer",
                        borderRadius: 12, display: "flex", gap: 12, alignItems: "center", justifyContent: "center", textAlign: "left",
                      }} disabled={selectedChoice !== null}>
                      <div style={{ minWidth: 40, textAlign: "center", fontSize: 18, fontWeight: 800 }}>{` ${i + 1}`}</div>
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontWeight: 700 }}>{c}</div>
                        <div style={{ fontSize: 14, color: "#fff", opacity: 0.9 }}>{i === quizQuestions[quizIndex].answer_index && selectedChoice !== null ? "correct!" : ""}</div>
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
                        : {
                            fontSize: buttonFontSize,
                            padding: isSmallScreen ? "8px 12px" : "10px 20px",
                            marginTop: isSmallScreen ? 12 : 16,
                            backgroundColor: "#1a4e8a",
                            color: "#fff",
                            border: "none",
                            borderRadius: 8,
                            cursor: "pointer",
                            width: buttonWidth,
                          }                  // 「了する」
                    }
                  >
                    {quizIndex + 1 < quizQuestions.length
                      ? "次の問題へ"
                      : "レッスンの結果を見る"}
                  </button>
                </div>
              )}

              <p style={{ marginTop: 12, fontSize: 14 }}>{quizIndex + 1} / {quizQuestions.length}</p>
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

        const praise = getPraise(attemptedPercent);

        return (
          <div
            style={{
              width: "100vw",
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
                width: "100%",
                maxWidth: isSmallScreen ? "100%" : 900,
                margin: isSmallScreen ? "0" : "0 auto",
              }}
            >
              <h2 style={{ fontSize: headingSize, marginBottom: 12 }}>
                 {`レッスン合計スコア${lessonNumber && Number.isFinite(lessonNumber) ? ` (Lesson ${lessonNumber})` : ""}`}
   
              </h2>

              <div style={{ fontSize: paragraphFontSize, marginBottom: 12 }}>
                <p>単語・意味マッチング: {matchingDisplayScore} / {matchingDisplayMax} ({matchingDisplayPercent}%)</p>
                <p>例文穴埋めクイズ: {quizDisplayScore} / {quizDisplayMax} ({quizDisplayPercent}%)</p>
                <hr style={{ margin: "12px 0" }} />
                <p style={{ fontSize: isSmallScreen ? 18 : 22, fontWeight: 700 }}>
                  合計: {attemptedTotalScore} / {attemptedTotalMax}
                </p>
                <p style={{ fontSize: isSmallScreen ? 18 : 22, marginTop: 8 }}>
                  正答率: {attemptedPercent}%
                </p>
                <p style={{ fontSize: isSmallScreen ? 14 : 18, marginTop: 8, color: "#333" }}>
                  {praise}
                </p>
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 12 }}>
                <button 
                 onClick={() => { if (genreFolder) nav(`/learn/${genreFolder}`); else nav('/learn'); }}
                 style={blueButtonStyle}>
                  レッスンを終了し、一覧ページに戻る
                </button>

              <button
                onClick={() => goToNextLesson()}
                style={{ ...blueButtonStyle, backgroundColor: "#16a34a" }}
              >
                {`次のレッスン${
                  lessonNumber && Number.isFinite(lessonNumber)
                    ? ` (Lesson ${lessonNumber + 1})`
                    : ""
                } に進む`}
              </button>


              {/*
              // Replay mistakes button (disabled for now)これを今後有効にする！
              {(wrongMeaningItems.length > 0 || wrongQuizItems.length > 0) && (
                <button
                  onClick={() => replayMistakes()}
                  style={{ ...blueButtonStyle, backgroundColor: "#f59e0b" }}
                >
                  間違えた問題をもう一度解いてみる
                </button>
              )}
              */}

              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
};

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
