import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  apiGetVocabStreamReview,
  apiSubmitVocabStreamProgress,
  type VocabStreamQuestionAttempt,
  type VocabStreamReviewQuestion,
} from "../api";
import { useAuth } from "../AuthContext";
import { speakEnglish } from "./speech";

export default function ReviewLesson() {
  const nav = useNavigate();
  const { token, user } = useAuth();
  const [questions, setQuestions] = useState<VocabStreamReviewQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [attempts, setAttempts] = useState<VocabStreamQuestionAttempt[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const attemptOrderRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLoading(false);
      setError("復習レッスンを使うにはログインが必要です。");
      return;
    }

    setLoading(true);
    apiGetVocabStreamReview(token)
      .then((data) => {
        if (cancelled) return;
        setQuestions(data.questions ?? []);
        setError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "復習データの読み込みに失敗しました。");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const currentQuestion = questions[index];
  const isFinished = questions.length > 0 && index >= questions.length;
  const score = attempts.filter((attempt) => attempt.isCorrect).length;
  const meaningTotal = questions.filter((question) => question.questionType === "meaning").length;
  const quizTotal = questions.filter((question) => question.questionType === "quiz").length;
  const meaningScore = attempts.filter((attempt) => attempt.questionType === "meaning" && attempt.isCorrect).length;
  const quizScore = attempts.filter((attempt) => attempt.questionType === "quiz" && attempt.isCorrect).length;
  const scorePercent = questions.length ? Math.round((score / questions.length) * 100) : 0;

  useEffect(() => {
    if (!isFinished || submitted || !token) return;
    setSubmitted(true);
    apiSubmitVocabStreamProgress(
      {
        anonymousUserId: getOrCreateAnonymousUserId(),
        userUsername: user?.username,
        lessonId: "vocabstream-review",
        genre: "review",
        lessonNumber: null,
        lessonTitle: "復習",
        wordCount: new Set(questions.map((question) => question.word.toLowerCase())).size,
        meaningScore,
        meaningTotal,
        quizScore,
        quizTotal,
        replayCompleted: false,
        replayCorrect: 0,
        replayTotal: 0,
        questionAttempts: attempts,
      },
      token,
    ).catch((err) => {
      setSubmitError(err instanceof Error ? err.message : "学習記録の保存に失敗しました。");
    });
  }, [attempts, isFinished, meaningScore, meaningTotal, quizScore, quizTotal, questions, submitted, token, user?.username]);

  function handleChoose(choiceIndex: number) {
    if (!currentQuestion || selectedChoice !== null) return;
    const isCorrect = choiceIndex === currentQuestion.answerIndex;
    attemptOrderRef.current += 1;
    setSelectedChoice(choiceIndex);
    setAttempts((prev) => [
      ...prev,
      {
        questionType: currentQuestion.questionType,
        word: currentQuestion.word,
        prompt: currentQuestion.prompt,
        correctAnswer: currentQuestion.correctAnswer,
        selectedAnswer: currentQuestion.choices[choiceIndex] ?? "",
        isCorrect,
        isReplay: false,
        attemptOrder: attemptOrderRef.current,
        choices: currentQuestion.choices,
        answeredAt: new Date().toISOString(),
        sourceCategory: currentQuestion.sourceCategory,
        sourceLessonId: currentQuestion.sourceLessonId,
        sourceLessonNumber: currentQuestion.sourceLessonNumber,
        definition: currentQuestion.definition,
        example: currentQuestion.example,
        explanation: currentQuestion.explanation,
        japaneseMeaning: currentQuestion.japaneseMeaning,
        synonyms: currentQuestion.synonyms,
        antonyms: currentQuestion.antonyms,
        forms: currentQuestion.forms,
      },
    ]);
  }

  function nextQuestion() {
    setSelectedChoice(null);
    setIndex((value) => value + 1);
  }

  function restartReview() {
    setStarted(false);
    setIndex(0);
    setSelectedChoice(null);
    setAttempts([]);
    setSubmitted(false);
    setSubmitError("");
    attemptOrderRef.current = 0;
  }

  function speakCurrentWord() {
    if (!currentQuestion) return;
    speakEnglish(`${currentQuestion.word}. ${currentQuestion.example || ""}`);
  }

  const panelStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: 900,
    background: "#ffffff",
    border: "1px solid rgba(96, 165, 250, 0.22)",
    borderRadius: 24,
    boxShadow: "0 18px 42px rgba(15, 23, 42, 0.12)",
    padding: "28px 32px",
    color: "#10203b",
  };
  const blueButtonStyle: React.CSSProperties = {
    fontSize: 16,
    padding: "13px 22px",
    background: "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 58%, #06b6d4 100%)",
    color: "#fff",
    border: "none",
    borderRadius: 999,
    cursor: "pointer",
    minWidth: 220,
    fontWeight: 800,
    boxShadow: "0 10px 22px rgba(37, 99, 235, 0.26)",
  };
  const scoreGaugeSize = 210;
  const gaugeColor =
    scorePercent >= 90
      ? "#16a34a"
      : scorePercent >= 70
        ? "#2563eb"
        : scorePercent >= 45
          ? "#f59e0b"
          : "#ef4444";

  return (
    <div style={{ minHeight: "100vh", background: "#e5e7eb", color: "#10203b", display: "flex", justifyContent: "center", padding: "20px" }}>
      <div style={panelStyle}>
        <style>{`
          .review-button-row {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
            margin-top: 18px;
          }

          .review-word-detail {
            margin-top: 16px;
            text-align: left;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 14px 16px;
            color: #1f2937;
            line-height: 1.6;
          }

          .review-feedback {
            margin-top: 18px;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            gap: 8px;
          }

          .review-feedback-status {
            margin: 0;
            font-size: 24px;
            font-weight: 900;
            line-height: 1.2;
          }

          .review-word-detail p {
            margin: 6px 0;
          }

          .review-audio-row {
            display: flex;
            justify-content: center;
            margin-bottom: 10px;
          }

          .review-results-grid {
            display: grid;
            grid-template-columns: minmax(220px, 0.7fr) minmax(260px, 1fr);
            gap: 22px;
            align-items: center;
            margin: 16px 0 18px;
          }

          .review-score-circle {
            width: ${scoreGaugeSize}px;
            height: ${scoreGaugeSize}px;
            border-radius: 50%;
            margin: 0 auto;
            display: grid;
            place-items: center;
            background: conic-gradient(${gaugeColor} 0deg ${scorePercent * 3.6}deg, #e2e8f0 ${scorePercent * 3.6}deg 360deg);
            box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.16), 0 14px 26px rgba(15, 23, 42, 0.12);
          }

          .review-score-circle-inner {
            width: 154px;
            height: 154px;
            border-radius: 50%;
            background: #fff;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            box-shadow: inset 0 8px 18px rgba(15, 23, 42, 0.05);
          }

          .review-breakdown {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 16px 18px;
            text-align: left;
          }

          @media (max-width: 720px) {
            .review-results-grid {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
        <button onClick={() => nav("/learn")} style={{ ...blueButtonStyle, minWidth: 0, marginBottom: 18 }}>
          ジャンル一覧に戻る
        </button>

        {loading ? (
          <p>復習データを読み込み中...</p>
        ) : error ? (
          <p style={{ color: "#b45309", fontWeight: 700 }}>{error}</p>
        ) : questions.length === 0 ? (
          <div>
            <h2 style={{ color: "#0f2f5f", marginTop: 0 }}>復習</h2>
            <p style={{ color: "#334155", lineHeight: 1.7 }}>
              まだ復習できる単語がありません。通常レッスンで間違えた単語が保存されると、ここにあなた専用の復習レッスンが表示されます。
            </p>
          </div>
        ) : !started ? (
          <div>
            <h2 style={{ color: "#0f2f5f", marginTop: 0 }}>復習レッスン</h2>
            <p style={{ color: "#334155", lineHeight: 1.8, fontSize: 18 }}>
              これまでに間違えた単語から、あなたの苦手な単語を復習します。定義マッチングと文中穴埋め問題を通して、記憶の定着を確認しましょう。
            </p>
            <p style={{ color: "#475569", fontWeight: 700 }}>
              全 {questions.length} 問（定義マッチング {meaningTotal} 問・例文穴埋め {quizTotal} 問）
            </p>
            <div className="review-button-row">
              <button onClick={() => setStarted(true)} style={blueButtonStyle}>
                復習を始める
              </button>
            </div>
          </div>
        ) : isFinished ? (
          <div>
            <h2 style={{ color: "#0f2f5f", marginTop: 0, textAlign: "center", fontSize: 32 }}>復習結果</h2>

            <div className="review-results-grid">
              <div>
                <div className="review-score-circle" aria-label={`正答率 ${scorePercent}%`}>
                  <div className="review-score-circle-inner">
                    <span style={{ fontSize: 14, color: "#64748b", fontWeight: 900 }}>正答率</span>
                    <span style={{ fontSize: 42, color: "#173a71", fontWeight: 900, lineHeight: 1 }}>{scorePercent}%</span>
                  </div>
                </div>
              </div>
              <div className="review-breakdown">
                <p style={{ fontSize: 24, fontWeight: 900, color: "#173a71", margin: "0 0 10px" }}>
                  Score: {score} / {questions.length}
                </p>
                <p style={{ margin: "6px 0" }}>単語・意味マッチング: {meaningScore} / {meaningTotal}</p>
                <p style={{ margin: "6px 0" }}>例文穴埋めクイズ: {quizScore} / {quizTotal}</p>
                <p style={{ margin: "12px 0 0", color: "#475569", lineHeight: 1.6 }}>
                  間違えた単語は苦手な単語リストに反映されます。
                </p>
              </div>
            </div>
            {submitError && <p style={{ color: "#b45309" }}>学習記録の保存に失敗しました。結果表示には影響ありません。</p>}

            <div style={{ display: "grid", gap: 12, marginTop: 20, textAlign: "left" }}>
              {attempts.map((attempt) => (
                <div key={attempt.attemptOrder} style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 14, background: attempt.isCorrect ? "#ecfdf5" : "#fff7ed" }}>
                  <strong style={{ color: attempt.isCorrect ? "#166534" : "#9a3412" }}>
                    {attempt.isCorrect ? "正解" : "不正解"}: {attempt.word}
                  </strong>
                  <p style={{ margin: "8px 0" }}>{attempt.prompt}</p>
                  <p style={{ margin: "4px 0" }}>正解: {attempt.correctAnswer}</p>
                  <p style={{ margin: "4px 0" }}>あなたの回答: {attempt.selectedAnswer}</p>
                  {attempt.definition && <p style={{ margin: "4px 0", color: "#475569" }}>定義: {attempt.definition}</p>}
                  {attempt.japaneseMeaning && <p style={{ margin: "4px 0", color: "#475569" }}>日本語: {attempt.japaneseMeaning}</p>}
                  {attempt.example && <p style={{ margin: "4px 0", color: "#475569" }}>例文: {attempt.example}</p>}
                  {attempt.synonyms && <p style={{ margin: "4px 0", color: "#475569" }}>類義語: {attempt.synonyms}</p>}
                  {attempt.antonyms && <p style={{ margin: "4px 0", color: "#475569" }}>対義語: {attempt.antonyms}</p>}
                  {attempt.forms && <p style={{ margin: "4px 0", color: "#475569" }}>語形: {attempt.forms}</p>}
                </div>
              ))}
            </div>

            <div className="review-button-row">
              <button onClick={restartReview} style={blueButtonStyle}>
                もう一度復習する
              </button>
              <button onClick={() => nav("/learn")} style={blueButtonStyle}>
                ジャンル一覧に戻る
              </button>
            </div>
          </div>
        ) : currentQuestion ? (
          <div>
            <h2 style={{ color: "#0f2f5f", marginTop: 0 }}>
              {currentQuestion.questionType === "meaning" ? "単語・意味マッチング" : "例文穴埋めクイズ"}
            </h2>
            <p style={{ color: "#475569", fontWeight: 700 }}>
              {index + 1} / {questions.length}
            </p>
            <p style={{ fontSize: 24, lineHeight: 1.55, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 16, padding: 18 }}>
              {currentQuestion.prompt}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              {currentQuestion.choices.map((choice, choiceIndex) => {
                const isCorrect = selectedChoice !== null && choiceIndex === currentQuestion.answerIndex;
                const isWrong = selectedChoice !== null && choiceIndex === selectedChoice && !isCorrect;
                return (
                  <button
                    key={choice}
                    onClick={() => handleChoose(choiceIndex)}
                    disabled={selectedChoice !== null}
                    style={{
                      border: "none",
                      borderRadius: 16,
                      padding: "14px 16px",
                      fontSize: 18,
                      fontWeight: 800,
                      cursor: selectedChoice === null ? "pointer" : "default",
                      color: selectedChoice === null ? "#fff" : "#0f172a",
                      background: isCorrect
                        ? "linear-gradient(90deg,#34d399,#16a34a)"
                        : isWrong
                          ? "linear-gradient(90deg,#ff7a7a,#ff4d4d)"
                          : selectedChoice !== null
                            ? "#e2e8f0"
                            : "linear-gradient(135deg, #2760a8 0%, #5687cc 70%, #42a8c4 100%)",
                    }}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>

            {selectedChoice !== null && (
              <div>
                <div className="review-feedback">
                  <p
                    className="review-feedback-status"
                    style={{ color: selectedChoice === currentQuestion.answerIndex ? "#166534" : "#b91c1c" }}
                  >
                    {selectedChoice === currentQuestion.answerIndex ? "correct!" : "Nice try!"}
                  </p>
                  <button onClick={nextQuestion} style={blueButtonStyle}>
                    {index + 1 < questions.length ? "次の問題へ" : "復習結果を見る"}
                  </button>
                </div>
                <div className="review-word-detail">
                  <div className="review-audio-row">
                    <button
                      onClick={speakCurrentWord}
                      style={{
                        ...blueButtonStyle,
                        minWidth: 180,
                        padding: "10px 16px",
                        fontSize: 15,
                        background: "linear-gradient(135deg, #3aa5d6 0%, #2f67b4 100%)",
                      }}
                    >
                      ▶️ 音声を聞く
                    </button>
                  </div>
                  <p><strong>単語:</strong> {currentQuestion.word}</p>
                  {currentQuestion.definition && <p><strong>定義:</strong> {currentQuestion.definition}</p>}
                  {currentQuestion.japaneseMeaning && <p><strong>日本語:</strong> {currentQuestion.japaneseMeaning}</p>}
                  {currentQuestion.example && <p><strong>例文:</strong> {currentQuestion.example}</p>}
                  {currentQuestion.synonyms && <p><strong>類義語:</strong> {currentQuestion.synonyms}</p>}
                  {currentQuestion.antonyms && <p><strong>対義語:</strong> {currentQuestion.antonyms}</p>}
                  {currentQuestion.forms && <p><strong>語形:</strong> {currentQuestion.forms}</p>}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
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
