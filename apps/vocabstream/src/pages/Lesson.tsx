import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "../lib/router-compat";
import { apiSubmitVocabStreamProgress, type VocabStreamReviewQuestion, type VocabStreamProgressPayload } from "../api";
import { useAuth } from "../AuthContext";
import { courseLabel, getCourse, lessonLabel } from "../lib/catalog";
import { createAttempt, makeLessonQuestions, summarizeAttempts, type LearningAttempt, type LessonData } from "../lib/learning";
import PracticeQuestion, { focusLearningHeading, WordDetails } from "../components/PracticeQuestion";
import { validWordImage } from "../lib/questionPolicy";
import VocabularyImage from "../components/VocabularyImage";
import { playAnswerSound, speakEnglish } from "./speech";

type Phase = "intro" | "cards" | "practice" | "results" | "replay";

export default function Lesson() {
  const { lessonId = "" } = useParams<{ lessonId: string }>();
  const nav = useNavigate();
  const { token, user } = useAuth();
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryLoad, setRetryLoad] = useState(0);
  const [phase, setPhase] = useState<Phase>("intro");
  const [cardIndex, setCardIndex] = useState(0);
  const [questions, setQuestions] = useState<VocabStreamReviewQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [attempts, setAttempts] = useState<LearningAttempt[]>([]);
  const [replayQuestions, setReplayQuestions] = useState<VocabStreamReviewQuestion[]>([]);
  const [replayStart, setReplayStart] = useState(0);
  const [replayCompleted, setReplayCompleted] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const answerLocked = useRef(false);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const wordHeading = useRef<HTMLHeadingElement>(null);
  const savedAttemptCount = useRef(0);
  const pendingSave = useRef<{ payload: VocabStreamProgressPayload; count: number } | null>(null);
  const saveInFlight = useRef(false);
  const lessonVersion = useRef(0);
  const previousUserId = useRef(user?.id);
  const learningOwner = useRef(user?.id);
  useEffect(() => {
    // Clear a signed-in learner's page state on logout/account switch; guest sign-in can save the current lesson.
    if (previousUserId.current && previousUserId.current !== user?.id) {
      lessonVersion.current += 1;
      setRetryLoad((value) => value + 1);
    }
    previousUserId.current = user?.id;
  }, [user?.id]);
  const [genre, rawNumber] = lessonId.split("-lesson-");
  const lessonNumber = Number(rawNumber);
  const course = getCourse(genre);
  const lessonTitle = course?.firstLesson ? lessonLabel(genre, lessonNumber) : lesson?.title ?? lessonLabel(genre, lessonNumber);
  const listPath = course ? `/learn/${genre}` : "/learn";

  useEffect(() => {
    const version = ++lessonVersion.current;
    const controller = new AbortController();
    setLoading(true); setLoadError(false); setLesson(null); setPhase("intro"); setCardIndex(0); setQuestionIndex(0); setQuestions([]); setAttempts([]); setReplayQuestions([]); setReplayCompleted(false); setSelected(null); setSaveState("idle");
    savedAttemptCount.current = 0; pendingSave.current = null; saveInFlight.current = false; answerLocked.current = false;
    async function load() {
      if (!course || !Number.isInteger(lessonNumber) || lessonNumber < 1 || lessonNumber > course.lessons) throw new Error("Unavailable lesson");
      const response = await fetch(`/vocabstream/data/${genre}/Lesson${lessonNumber}.json`, { signal: controller.signal });
      if (!response.ok) throw new Error("Unable to load lesson");
      const data = await response.json() as LessonData;
      if (!Array.isArray(data.words) || !data.words.length) throw new Error("Empty lesson");
      if (version !== lessonVersion.current) return;
      learningOwner.current = previousUserId.current;
      setLesson(data); setQuestions(makeLessonQuestions(data, lessonId));
    }
    load().catch(() => { if (!controller.signal.aborted) setLoadError(true); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [lessonId, genre, lessonNumber, course, retryLoad]);

  useEffect(() => {
    if (phase === "results") focusLearningHeading(pageHeading.current);
    if (phase === "cards") focusLearningHeading(wordHeading.current);
  }, [phase, cardIndex]);
  const summary = summarizeAttempts(questions, attempts);
  const replayAttempts = attempts.slice(replayStart).filter((attempt) => attempt.isReplay);
  const replayCorrect = replayAttempts.filter((attempt) => attempt.isCorrect).length;
  const saveProgress = useCallback(async () => {
    if (learningOwner.current && learningOwner.current !== user?.id) return;
    if (!token || !lesson || attempts.length === 0 || saveInFlight.current || savedAttemptCount.current === attempts.length) return;
    learningOwner.current = user?.id;
    saveInFlight.current = true; setSaveState("saving");
    const version = lessonVersion.current;
    try {
      // Keep the exact payload and UUID if a request committed but its response was lost.
      while (savedAttemptCount.current < attempts.length) {
        if (!pendingSave.current) pendingSave.current = {
          count: attempts.length,
          payload: { attemptId: crypto.randomUUID(), lessonId, genre, lessonNumber, lessonTitle, wordCount: lesson.words.length, meaningScore: summary.meaningScore, meaningTotal: summary.meaningTotal, quizScore: summary.quizScore, quizTotal: summary.quizTotal, replayCompleted, replayCorrect: replayCompleted ? replayCorrect : 0, replayTotal: replayCompleted ? replayQuestions.length : 0, questionAttempts: attempts.slice(savedAttemptCount.current) },
        };
        const pending = pendingSave.current;
        await apiSubmitVocabStreamProgress(pending.payload, token);
        if (version !== lessonVersion.current) return;
        savedAttemptCount.current = pending.count;
        pendingSave.current = null;
      }
      setSaveState("saved");
    } catch { if (version === lessonVersion.current) setSaveState("error"); }
    finally { if (version === lessonVersion.current) saveInFlight.current = false; }
  }, [user?.id, lesson, attempts, lessonId, genre, lessonNumber, lessonTitle, summary.meaningScore, summary.meaningTotal, summary.quizScore, summary.quizTotal, replayCompleted, replayCorrect, replayQuestions.length, token]);
  useEffect(() => { if (phase === "results") void saveProgress(); }, [phase, saveProgress]);

  const activeQuestions = phase === "replay" ? replayQuestions : questions;
  const question = activeQuestions[questionIndex];
  function beginPractice(index = 0) {
    setPhase("practice"); setQuestionIndex(index); const previous = attempts.find((attempt) => !attempt.isReplay && attempt.questionId === questions[index]?.id);
    setSelected(previous ? questions[index].choices.indexOf(previous.selectedAnswer) : null); answerLocked.current = Boolean(previous);
  }
  function choose(choice: number) {
    if (!question || answerLocked.current) return;
    answerLocked.current = true;
    setSelected(choice);
    playAnswerSound(choice === question.answerIndex);
    setAttempts((previous) => [...previous, createAttempt(question, choice, previous.length + 1, phase === "replay")]);
  }
  function nextQuestion() {
    if (questionIndex + 1 >= activeQuestions.length) { if (phase === "replay") setReplayCompleted(true); setPhase("results"); return; }
    const nextIndex = questionIndex + 1;
    const previous = phase === "replay" ? undefined : attempts.find((attempt) => !attempt.isReplay && attempt.questionId === activeQuestions[nextIndex].id);
    setSelected(previous ? activeQuestions[nextIndex].choices.indexOf(previous.selectedAnswer) : null); answerLocked.current = Boolean(previous); setQuestionIndex(nextIndex);
  }
  const latestAnswers = new Map(attempts.map((attempt) => [attempt.questionId, attempt]));
  const remaining = questions.filter((item) => latestAnswers.get(item.id)?.isCorrect === false);
  function replayMistakes() { setReplayQuestions(remaining); setReplayStart(attempts.length); setReplayCompleted(false); setQuestionIndex(0); setSelected(null); answerLocked.current = false; setPhase("replay"); }

  if (loading) return <div className="vs-page vs-practice"><div className="vs-state" role="status"><h1>レッスンを準備しています</h1><p>単語と例文を読み込んでいます…</p></div></div>;
  if (loadError || !lesson) return <div className="vs-page vs-practice"><div className="vs-state" role="alert"><h1>レッスンを読み込めませんでした</h1><p>通信状況を確認して、もう一度お試しください。</p><div className="vs-actions"><button className="pf-button" onClick={() => setRetryLoad((value) => value + 1)}>もう一度読み込む</button><Link className="pf-button-secondary" to={listPath}>レッスン一覧へ</Link></div></div></div>;
  const word = lesson.words[cardIndex];
  const wordImage = validWordImage(word.image);
  const stageLabels = ["単語を学ぶ", ...(summary.meaningTotal ? ["意味を選ぶ"] : []), ...(summary.quizTotal ? ["例文で確認"] : [])];
  const stage = phase === "cards" || phase === "intro" ? 0 : question?.questionType === "meaning" || !summary.meaningTotal ? 1 : 2;
  return <div className="vs-page vs-practice">
    {course?.firstLesson && lessonNumber < course.firstLesson && <div className="vs-notice">以前のレッスンです。学習記録はそのまま残っています。新しい熟語レッスンは Lesson 1 から学べます。<Link className="vs-text-button" to={`/lesson/${genre}-lesson-${course.firstLesson}`}>新しい熟語レッスンへ</Link></div>}
    <header className="vs-practice-heading"><Link className="vs-back" to={listPath}>← 一覧</Link><h1 ref={pageHeading} tabIndex={-1}>{phase === "results" ? "レッスン完了" : phase === "replay" ? "間違いを復習" : lessonLabel(genre, lessonNumber)}</h1><p className="vs-practice-context">{courseLabel(genre)}</p></header>
    {phase !== "results" && phase !== "replay" && <ol className="vs-stage-nav" aria-label="レッスンの流れ">{stageLabels.map((label, i) => <li key={label}><button aria-current={stage === i ? "step" : undefined} disabled={i === 2} onClick={() => i === 0 ? setPhase("cards") : beginPractice()}>{i + 1}. {label}</button></li>)}</ol>}
    <section className="vs-practice-panel">
      {phase === "intro" && <>{!summary.quizTotal && <p className="vs-muted">例文は単語カードで確認できます。</p>}<div className="vs-practice-topline"><span>今日の単語</span><span>{lesson.words.length} 語</span></div><div className="vs-word-list">{lesson.words.map((item, i) => <span lang="en" key={`${item.word}-${i}`}>{item.word}</span>)}</div><div className="vs-actions"><button className="pf-button" onClick={() => setPhase("cards")}>単語を学び始める <span aria-hidden="true">→</span></button>{questions.length > 0 && <button className="pf-button-secondary" onClick={() => beginPractice()}>クイズから始める</button>}</div></>}
      {phase === "cards" && <><div className="vs-practice-topline"><span>単語を学ぶ</span><span>{cardIndex + 1} / {lesson.words.length} 語</span></div><progress className="vs-progress" max={lesson.words.length} value={cardIndex + 1} aria-label="単語学習の進み具合" /><div className="vs-word-heading"><h2 ref={wordHeading} tabIndex={-1} className="vs-word-title" lang="en">{word.word}</h2><button className="pf-button-secondary" onClick={() => speakEnglish(`${word.word}. ${word.example || ""}`)}>音声を聞く</button></div>{wordImage && <VocabularyImage image={wordImage} />}<p className="vs-definition" lang={word.meaning ? "en" : "ja"}>{word.meaning || word.japaneseMeaning}</p>{word.example && <blockquote className="vs-example" lang="en">{word.example}</blockquote>}<div className="vs-practice-footer"><button className="pf-button-secondary" onClick={() => cardIndex > 0 ? setCardIndex((value) => value - 1) : setPhase("intro")}>前へ</button><button className="pf-button" onClick={() => cardIndex + 1 < lesson.words.length ? setCardIndex((value) => value + 1) : questions.length ? beginPractice() : setPhase("results")}>{cardIndex + 1 < lesson.words.length ? "次の単語へ" : questions.length ? "クイズで確認" : "学習を終える"} <span aria-hidden="true">→</span></button></div><details className="vs-details"><summary>日本語訳・関連語を見る</summary><WordDetails word={word} /></details></>}
      {(phase === "practice" || phase === "replay") && question && <PracticeQuestion question={question} index={questionIndex} total={activeQuestions.length} selected={selected} onChoose={choose} onNext={nextQuestion} nextLabel={questionIndex + 1 === activeQuestions.length ? "結果を見る" : question.questionType !== activeQuestions[questionIndex + 1]?.questionType ? "次の練習へ" : "次の問題へ"} />}
      {phase === "results" && <><h2>{!summary.total ? "単語の確認が完了しました" : summary.percent === 100 ? "すべて正解です！" : "今回の結果"}</h2>{summary.total > 0 && <><div className="vs-result-score"><strong>{summary.percent}%</strong><span>{summary.score} / {summary.total} 問正解</span></div><div className="vs-result-breakdown">{summary.meaningTotal > 0 && <div>意味を選ぶ<strong>{summary.meaningScore} / {summary.meaningTotal}</strong></div>}{summary.quizTotal > 0 && <div>例文で確認<strong>{summary.quizScore} / {summary.quizTotal}</strong></div>}</div></>}{!summary.total && <p className="vs-muted">このレッスンは単語と例文を読む練習です。採点や学習記録の保存はありません。</p>}{remaining.length > 0 && <p className="vs-muted">{remaining.length} 問を復習できます。</p>}{replayCompleted && <div className="vs-feedback" role="status"><strong>復習も完了しました</strong><p>復習した {replayQuestions.length} 問のうち、{replayCorrect} 問に正解しました。最初の正答率は上に表示しています。</p></div>}
        {saveState === "saving" && <p className="vs-muted" role="status">学習記録を保存しています…</p>}{saveState === "saved" && token && <p className="vs-muted" role="status">学習記録を保存しました。</p>}{!token && summary.total > 0 && <p className="vs-muted">ログインすると、学習記録と復習する単語をアカウントに保存できます。</p>}{saveState === "error" && <div className="vs-notice" role="alert">学習記録を保存できませんでした。結果はこの画面で確認できます。<button className="vs-text-button" onClick={() => void saveProgress()}>保存を再試行</button></div>}
        <div className="vs-actions">{remaining.length > 0 && <button className="pf-button" onClick={replayMistakes} disabled={saveState === "saving"}>間違えた問題を復習する</button>}{course && lessonNumber < course.lessons && <button className={remaining.length ? "pf-button-secondary" : "pf-button"} onClick={() => nav(`/lesson/${genre}-lesson-${lessonNumber + 1}`)}>次のレッスンへ <span aria-hidden="true">→</span></button>}<Link className="pf-button-secondary" to={listPath}>レッスン一覧へ</Link></div></>}
    </section>
  </div>;
}
