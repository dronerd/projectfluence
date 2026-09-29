import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "../lib/router-compat";
import { apiGetVocabStreamLessonProgress, type VocabStreamLessonProgress } from "../api";
import { useAuth } from "../AuthContext";
import { getCourse, courseLabel } from "../lib/catalog";

export default function LessonList() {
  const { genreId = "" } = useParams<{ genreId: string }>();
  const course = getCourse(genreId);
  const { token, loading: authLoading } = useAuth();
  const [progress, setProgress] = useState<Record<string, VocabStreamLessonProgress>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let cancelled = false;
    setProgress({}); setError(false); setSelectedPage(null);
    if (!token || !genreId) { setLoading(false); return; }
    setLoading(true);
    apiGetVocabStreamLessonProgress(genreId, token).then((items) => {
      if (!cancelled) setProgress(Object.fromEntries(items.map((item) => [item.lessonId, item])));
    }).catch(() => { if (!cancelled) setError(true); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [genreId, token, retry]);
  if (!course) return <div className="vs-page"><div className="vs-state"><h1>レッスンを選びましょう</h1><p>この分野のレッスンは、まだ公開されていません。</p><Link to="/learn" className="pf-button">レベルを選ぶ</Link></div></div>;
  const lessons = Array.from({ length: course.lessons }, (_, i) => ({ number: i + 1, id: `${genreId}-lesson-${i + 1}` }));
  const completed = lessons.filter((lesson) => progress[lesson.id]?.totalPossible > 0).length;
  const nextLesson = lessons.find((lesson) => !progress[lesson.id]?.totalPossible) ?? lessons[0];
  const loadingProgress = loading || authLoading;
  const pageSize = 20;
  const pageCount = Math.ceil(lessons.length / pageSize);
  const pageNumber = Math.min(selectedPage ?? Math.floor((nextLesson.number - 1) / pageSize), pageCount - 1);
  const visibleLessons = lessons.slice(pageNumber * pageSize, (pageNumber + 1) * pageSize);
  function changePage(value: number) {
    setSelectedPage(value);
    requestAnimationFrame(() => { listHeading.current?.focus({ preventScroll: true }); listHeading.current?.scrollIntoView({ block: "start" }); });
  }
  return <div className="vs-page">
    <Link className="vs-back" to="/learn">← レベルを選ぶ</Link>
    <header className="vs-page-heading"><p className="pf-eyebrow">{genreId.startsWith("idioms-") ? "IDIOM PRACTICE" : "VOCABULARY PRACTICE"}</p><h1>{courseLabel(genreId)}</h1><p>{course.description}。1つのレッスンから、気軽に始めましょう。</p></header>
    <section className="vs-start-strip" aria-labelledby="vs-next-title"><div><h2 id="vs-next-title">{loadingProgress ? "学習記録を確認しています" : completed === course.lessons ? "もう一度、理解を確かめましょう" : completed ? `次は Lesson ${nextLesson.number}` : "Lesson 1 から始めましょう"}</h2><p>{loadingProgress ? "レッスンは下の一覧から選べます。" : token ? `${completed} / ${course.lessons} レッスンを学習済み` : "ログインすると、学習記録を保存して続きから学べます。"}</p>{token && !loadingProgress && <progress className="vs-progress" max={course.lessons} value={completed} aria-label="学習済みのレッスン" />}</div><Link className="pf-button" to={`/lesson/${nextLesson.id}`}>{completed ? "学習を続ける" : "学習を始める"}<span aria-hidden="true">→</span></Link></section>
    {error && <div className="vs-notice" role="alert">学習記録を読み込めませんでした。レッスンはそのまま学べます。<button className="vs-text-button" onClick={() => setRetry((value) => value + 1)}>再読み込み</button></div>}
    <section className="vs-section" aria-labelledby="vs-lesson-list"><div className="vs-section-heading"><h2 id="vs-lesson-list" ref={listHeading} tabIndex={-1}>レッスン一覧</h2><span className="vs-muted" aria-live="polite">{pageNumber * pageSize + 1}–{Math.min((pageNumber + 1) * pageSize, lessons.length)} / {course.lessons}</span></div>
      <div className="vs-pagination-select"><label htmlFor="vs-lesson-group">レッスンの範囲</label><select id="vs-lesson-group" value={pageNumber} onChange={(event) => changePage(Number(event.target.value))}>{Array.from({ length: pageCount }, (_, index) => <option value={index} key={index}>Lesson {index * pageSize + 1}–{Math.min((index + 1) * pageSize, lessons.length)}</option>)}</select></div>
      <div className="vs-lesson-grid">{visibleLessons.map((lesson) => {
        const result = progress[lesson.id]; const done = Boolean(result?.totalPossible);
        return <Link key={lesson.id} className={`vs-lesson-card${done ? " is-completed" : ""}`} to={`/lesson/${lesson.id}`}><span className="vs-lesson-number">Lesson {lesson.number}</span><span className="vs-lesson-status">{done ? `学習済み · 正答率 ${Math.round(result.percentScore)}%` : "単語を学ぶ・クイズで確認"}</span><span className="vs-lesson-action">{done ? "もう一度学ぶ" : "始める"}<span aria-hidden="true">→</span></span></Link>;
      })}</div>
      <nav className="vs-pagination" aria-label="レッスン一覧のページ"><button className="pf-button-secondary" disabled={pageNumber === 0} onClick={() => changePage(pageNumber - 1)}>← 前の20件</button><span className="vs-muted">{pageNumber + 1} / {pageCount}</span><button className="pf-button-secondary" disabled={pageNumber + 1 === pageCount} onClick={() => changePage(pageNumber + 1)}>次の20件 →</button></nav>
    </section>
  </div>;
}
