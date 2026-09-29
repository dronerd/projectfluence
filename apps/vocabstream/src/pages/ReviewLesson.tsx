import { useEffect, useRef, useState } from "react";
import { Link } from "../lib/router-compat";
import { apiSubmitVocabStreamProgress } from "../api";
import { useAuth } from "../AuthContext";
import { useReviewData } from "../lib/useReviewData";
import { anonymousUserId, createAttempt, summarizeAttempts, type LearningAttempt } from "../lib/learning";
import PracticeQuestion, { WordDetails } from "../components/PracticeQuestion";
import ReviewState from "../components/ReviewState";

export default function ReviewLesson() {
  const { token, user } = useAuth();
  const { questions, loading, signedIn, error, refresh } = useReviewData();
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [attempts, setAttempts] = useState<LearningAttempt[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [retrySave, setRetrySave] = useState(0);
  const locked = useRef(false);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const saving = useRef(false);
  const saved = useRef(false);
  const finished = started && questions.length > 0 && index >= questions.length;
  useEffect(() => { if (finished) pageHeading.current?.focus({ preventScroll: true }); }, [finished]);
  const summary = summarizeAttempts(questions, attempts);
  const ready = !loading && signedIn && !error && questions.length > 0;
  useEffect(() => {
    if (!finished || !token || saved.current || saving.current) return;
    saving.current = true; setSaveState("saving");
    apiSubmitVocabStreamProgress({ anonymousUserId: anonymousUserId(), userUsername: user?.username, lessonId: "vocabstream-review", genre: "review", lessonNumber: null, lessonTitle: "復習", wordCount: new Set(questions.map((q) => q.word.toLowerCase())).size, meaningScore: summary.meaningScore, meaningTotal: summary.meaningTotal, quizScore: summary.quizScore, quizTotal: summary.quizTotal, replayCompleted: false, replayCorrect: 0, replayTotal: 0, questionAttempts: attempts }, token).then(() => { saved.current = true; setSaveState("saved"); }).catch(() => setSaveState("error")).finally(() => { saving.current = false; });
  }, [finished, token, user?.username, questions, attempts, summary.meaningScore, summary.meaningTotal, summary.quizScore, summary.quizTotal, retrySave]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); }, [index, started]);
  function choose(choice: number) { if (locked.current) return; locked.current = true; setSelected(choice); setAttempts((previous) => [...previous, createAttempt(questions[index], choice, previous.length + 1)]); }
  function restart() { setStarted(false); setIndex(0); setSelected(null); setAttempts([]); setSaveState("idle"); saved.current = false; locked.current = false; refresh(); }
  return <div className="vs-page vs-practice">
    <Link className="vs-back" to="/learn">← レッスン一覧</Link>
    <header className="vs-page-heading"><p className="pf-eyebrow">PERSONAL REVIEW</p><h1 ref={pageHeading} tabIndex={-1}>{finished ? "復習完了" : "思い出すほど、身につく。"}</h1><p>あなたの学習記録から、もう一度練習したい単語を集めました。</p></header>
    <ReviewState loading={loading} signedIn={signedIn} error={error} empty={!questions.length} onRetry={refresh} />
    {ready && <section className="vs-practice-panel">
      {!started ? <><h2>今日の復習レッスン</h2><p className="vs-muted">定義に合う単語を選び、例文の空欄を埋めて、記憶を確かめましょう。</p><div className="vs-result-breakdown"><div>意味を選ぶ<strong>{summary.meaningTotal} 問</strong></div><div>例文で確認<strong>{summary.quizTotal} 問</strong></div></div><p className="vs-muted">全 {questions.length} 問。正解したあとも、意味や音声を確認できます。</p><div className="vs-actions"><button className="pf-button" onClick={() => setStarted(true)}>復習を始める <span aria-hidden="true">→</span></button><Link className="pf-button-secondary" to="/weak-words">単語を先に確認</Link></div></>
        : finished ? <><p className="pf-eyebrow">おつかれさまでした</p><h2>{summary.percent === 100 ? "すべて正解です！" : "今日の復習も、次への一歩です。"}</h2><div className="vs-result-score"><strong>{summary.percent}%</strong><span>{summary.score} / {summary.total} 問正解</span></div><div className="vs-result-breakdown"><div>意味を選ぶ<strong>{summary.meaningScore} / {summary.meaningTotal}</strong></div><div>例文で確認<strong>{summary.quizScore} / {summary.quizTotal}</strong></div></div><p className="vs-muted">迷ったことばは、例文でもう一度確認してみましょう。</p>{saveState === "saving" && <p className="vs-muted" role="status">学習記録を保存しています…</p>}{saveState === "saved" && <p className="vs-muted" role="status">学習記録を保存しました。</p>}{saveState === "error" && <div className="vs-notice" role="alert">学習記録を保存できませんでした。<button className="vs-text-button" onClick={() => setRetrySave((value) => value + 1)}>保存を再試行</button></div>}<div className="vs-actions"><Link className="pf-button" to="/learn">次のレッスンを選ぶ <span aria-hidden="true">→</span></Link><button className="pf-button-secondary" onClick={restart} disabled={saveState === "saving"}>もう一度復習する</button></div><details className="vs-details"><summary>今回の回答を振り返る（{attempts.length} 問）</summary>{attempts.map((attempt) => <article key={attempt.attemptOrder} className="vs-result-attempt"><strong>{attempt.isCorrect ? "✓ 正解" : "もう一度確認"} · {attempt.word}</strong><p>{attempt.prompt}</p><p>正解: {attempt.correctAnswer}</p>{!attempt.isCorrect && <p>あなたの回答: {attempt.selectedAnswer}</p>}<p>{attempt.definition}</p>{attempt.example && <p className="vs-example">{attempt.example}</p>}<WordDetails word={attempt} /></article>)}</details></>
        : <PracticeQuestion question={questions[index]} index={index} total={questions.length} selected={selected} onChoose={choose} onNext={() => { setIndex((value) => value + 1); setSelected(null); locked.current = false; }} nextLabel={index + 1 === questions.length ? "復習の結果を見る" : "次の問題へ"} />}
    </section>}
  </div>;
}
