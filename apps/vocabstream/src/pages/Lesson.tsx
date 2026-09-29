import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "../lib/router-compat";
import { apiSubmitVocabStreamProgress, type VocabStreamReviewQuestion } from "../api";
import { useAuth } from "../AuthContext";
import { courseLabel, getCourse } from "../lib/catalog";
import { anonymousUserId, createAttempt, makeLessonQuestions, summarizeAttempts, type LearningAttempt, type LessonData } from "../lib/learning";
import PracticeQuestion, { WordDetails } from "../components/PracticeQuestion";
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
  const [soundEnabled, setSoundEnabled] = useState(true);
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
  const saveInFlight = useRef(false);
  const lessonVersion = useRef(0);
  const [genre, rawNumber] = lessonId.split("-lesson-");
  const lessonNumber = Number(rawNumber);
  const course = getCourse(genre);
  const listPath = course ? `/learn/${genre}` : "/learn";

  useEffect(() => {
    const version = ++lessonVersion.current;
    const controller = new AbortController();
    setLoading(true); setLoadError(false); setLesson(null); setPhase("intro"); setCardIndex(0); setQuestionIndex(0); setQuestions([]); setAttempts([]); setReplayQuestions([]); setReplayCompleted(false); setSelected(null); setSaveState("idle");
    savedAttemptCount.current = 0; saveInFlight.current = false; answerLocked.current = false;
    async function load() {
      if (!course || !Number.isInteger(lessonNumber) || lessonNumber < 1 || lessonNumber > course.lessons) throw new Error("Unavailable lesson");
      const response = await fetch(`/vocabstream/data/${genre}/Lesson${lessonNumber}.json`, { signal: controller.signal });
      if (!response.ok) throw new Error("Unable to load lesson");
      const data = await response.json() as LessonData;
      if (!Array.isArray(data.words) || !data.words.length) throw new Error("Empty lesson");
      if (version !== lessonVersion.current) return;
      setLesson(data); setQuestions(makeLessonQuestions(data, lessonId));
    }
    load().catch(() => { if (!controller.signal.aborted) setLoadError(true); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [lessonId, genre, lessonNumber, course, retryLoad]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); }, [phase, cardIndex, questionIndex]);
  useEffect(() => {
    if (phase === "results") pageHeading.current?.focus({ preventScroll: true });
    if (phase === "cards") wordHeading.current?.focus({ preventScroll: true });
  }, [phase, cardIndex]);
  const summary = summarizeAttempts(questions, attempts);
  const replayAttempts = attempts.slice(replayStart).filter((attempt) => attempt.isReplay);
  const replayCorrect = replayAttempts.filter((attempt) => attempt.isCorrect).length;
  const saveProgress = useCallback(async () => {
    if (!lesson || attempts.length === 0 || saveInFlight.current || savedAttemptCount.current === attempts.length) return;
    saveInFlight.current = true; setSaveState("saving");
    const version = lessonVersion.current;
    const unsaved = attempts.slice(savedAttemptCount.current);
    try {
      await apiSubmitVocabStreamProgress({ anonymousUserId: anonymousUserId(), userUsername: user?.username, lessonId, genre, lessonNumber, lessonTitle: lesson.title ?? `Lesson ${lessonNumber}`, wordCount: lesson.words.length, meaningScore: summary.meaningScore, meaningTotal: summary.meaningTotal, quizScore: summary.quizScore, quizTotal: summary.quizTotal, replayCompleted, replayCorrect: replayCompleted ? replayCorrect : 0, replayTotal: replayCompleted ? replayQuestions.length : 0, questionAttempts: unsaved }, token);
      if (version !== lessonVersion.current) return;
      savedAttemptCount.current = attempts.length; setSaveState("saved");
    } catch { if (version === lessonVersion.current) setSaveState("error"); }
    finally { if (version === lessonVersion.current) saveInFlight.current = false; }
  }, [lesson, attempts, user?.username, lessonId, genre, lessonNumber, summary.meaningScore, summary.meaningTotal, summary.quizScore, summary.quizTotal, replayCompleted, replayCorrect, replayQuestions.length, token]);
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
    if (soundEnabled) playAnswerSound(choice === question.answerIndex);
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
  const stage = phase === "cards" || phase === "intro" ? 0 : question?.questionType === "meaning" ? 1 : 2;
  return <div className="vs-page vs-practice">
    <Link className="vs-back" to={listPath}>← レッスン一覧</Link>
    <header className="vs-page-heading"><p className="pf-eyebrow">{courseLabel(genre)}</p><h1 ref={pageHeading} tabIndex={-1}>{phase === "results" ? "レッスン完了" : phase === "replay" ? "間違えた問題を復習" : `Lesson ${lessonNumber}`}</h1></header>
    {phase !== "results" && phase !== "replay" && <ol className="vs-stage-nav" aria-label="レッスンの流れ">{["単語を学ぶ", "意味を選ぶ", "例文で確認"].map((label, i) => <li key={label}><button aria-current={stage === i ? "step" : undefined} disabled={i === 2} onClick={() => i === 0 ? setPhase("cards") : beginPractice()}>{i + 1}. {label}</button></li>)}</ol>}
    <section className="vs-practice-panel">
      {(phase === "practice" || phase === "replay") && <button className="vs-sound-toggle" aria-pressed={soundEnabled} onClick={() => setSoundEnabled((value) => !value)}>回答音 {soundEnabled ? "オン" : "オフ"}</button>}
      {phase === "intro" && <><div className="vs-practice-topline"><span>今日の単語</span><span>{lesson.words.length} 語</span></div><h2 style={{ marginTop: 16 }}>まずは、ことばに触れてみましょう。</h2><div className="vs-word-list">{lesson.words.map((item, i) => <span lang="en" key={`${item.word}-${i}`}>{item.word}</span>)}</div><p className="vs-muted">英語の定義を読み、例文から使い方をつかみましょう。日本語訳や関連語は、必要なときに確認できます。</p><div className="vs-learning-steps"><div><strong>1. 単語を学ぶ</strong><p>意味と例文を読み、音声を聞く</p></div><div><strong>2. 意味を選ぶ</strong><p>定義に合う単語を選ぶ</p></div><div><strong>3. 例文で確認</strong><p>空欄を埋めて使い方を確かめる</p></div></div><div className="vs-actions"><button className="pf-button" onClick={() => setPhase("cards")}>単語を学び始める <span aria-hidden="true">→</span></button>{questions.length > 0 && <button className="pf-button-secondary" onClick={() => beginPractice()}>クイズから始める</button>}</div></>}
      {phase === "cards" && <><div className="vs-practice-topline"><span>単語を学ぶ</span><span>{cardIndex + 1} / {lesson.words.length} 語</span></div><progress className="vs-progress" max={lesson.words.length} value={cardIndex + 1} aria-label="単語学習の進み具合" /><h2 ref={wordHeading} tabIndex={-1} className="vs-word-title" lang="en">{word.word}</h2><p className="vs-definition" lang={word.meaning ? "en" : "ja"}>{word.meaning || word.japaneseMeaning}</p>{word.example && <blockquote className="vs-example" lang="en">{word.example}</blockquote>}<button className="pf-button-secondary" onClick={() => speakEnglish(`${word.word}. ${word.example || ""}`)}>音声を聞く</button><p className="vs-muted">例文を声に出して、使い方を確かめてみましょう。</p><details className="vs-details"><summary>日本語訳・関連語を見る</summary><WordDetails word={word} /></details><div className="vs-practice-footer"><button className="pf-button-secondary" onClick={() => cardIndex > 0 ? setCardIndex((value) => value - 1) : setPhase("intro")}>前へ</button><button className="pf-button" onClick={() => cardIndex + 1 < lesson.words.length ? setCardIndex((value) => value + 1) : questions.length ? beginPractice() : setPhase("results")}>{cardIndex + 1 < lesson.words.length ? "次の単語へ" : "クイズで確認"} <span aria-hidden="true">→</span></button></div></>}
      {(phase === "practice" || phase === "replay") && question && <PracticeQuestion question={question} index={questionIndex} total={activeQuestions.length} selected={selected} onChoose={choose} onNext={nextQuestion} nextLabel={questionIndex + 1 === activeQuestions.length ? "結果を見る" : question.questionType !== activeQuestions[questionIndex + 1]?.questionType ? "次の練習へ" : "次の問題へ"} />}
      {phase === "results" && <><p className="pf-eyebrow">今日の学習、おつかれさまでした</p><h2>{summary.percent === 100 ? "すべて正解です！" : "学んだことを、次につなげましょう。"}</h2><div className="vs-result-score"><strong>{summary.percent}%</strong><span>{summary.score} / {summary.total} 問正解</span></div><div className="vs-result-breakdown"><div>意味を選ぶ<strong>{summary.meaningScore} / {summary.meaningTotal}</strong></div><div>例文で確認<strong>{summary.quizScore} / {summary.quizTotal}</strong></div></div><p className="vs-muted">{remaining.length ? `あと ${remaining.length} 問をもう一度。意味や使い方を確かめるチャンスです。` : "今日学んだ単語を、自分のことばで使ってみましょう。"}</p>{replayCompleted && <div className="vs-feedback" role="status"><strong>復習も完了しました</strong><p>復習した {replayQuestions.length} 問のうち、{replayCorrect} 問に正解しました。最初の正答率は上に表示しています。</p></div>}
        {saveState === "saving" && <p className="vs-muted" role="status">学習記録を保存しています…</p>}{saveState === "saved" && token && <p className="vs-muted" role="status">学習記録を保存しました。</p>}{!token && <p className="vs-muted">ログインすると、学習記録と復習する単語をアカウントに保存できます。</p>}{saveState === "error" && <div className="vs-notice" role="alert">学習記録を保存できませんでした。結果はこの画面で確認できます。<button className="vs-text-button" onClick={() => void saveProgress()}>保存を再試行</button></div>}
        <div className="vs-actions">{remaining.length > 0 && <button className="pf-button" onClick={replayMistakes} disabled={saveState === "saving"}>間違えた問題を復習する</button>}{course && lessonNumber < course.lessons && <button className={remaining.length ? "pf-button-secondary" : "pf-button"} onClick={() => nav(`/lesson/${genre}-lesson-${lessonNumber + 1}`)}>次のレッスンへ <span aria-hidden="true">→</span></button>}<Link className="pf-button-secondary" to={listPath}>レッスン一覧へ</Link></div></>}
    </section>
  </div>;
}
