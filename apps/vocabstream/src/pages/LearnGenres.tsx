import { Link } from "../lib/router-compat";
import { useAuth } from "../AuthContext";
import { vocabularyCourses, idiomCourses, upcomingCourses, type VocabularyCourse } from "../lib/catalog";

function Courses({ courses }: { courses: VocabularyCourse[] }) {
  return <div className="vs-course-grid">{courses.map((course) => <Link className="vs-course" to={`/learn/${course.id}`} key={course.id}>
    <span className="vs-level">CEFR {course.level}</span>
    <h3>{course.title}</h3>
    <p>{course.description}</p>
    <span className="vs-course-footer">{course.lessons} レッスン <span aria-hidden="true">→</span></span>
  </Link>)}</div>;
}

export default function LearnGenres() {
  const { user } = useAuth();
  return <div className="vs-page">
    <header className="vs-page-heading">
      <p className="pf-eyebrow">VOCABULARY PRACTICE</p>
      <h1>ことばの意味から、英語を身につける。</h1>
      <p>英語の定義と例文で学び、クイズで確認。自分に合うレベルから始めましょう。</p>
    </header>
    <section className="vs-start-strip" aria-labelledby="vs-start-title">
      <div><h2 id="vs-start-title">{user ? "今日も、少しずつ積み重ねましょう。" : "どこから始めるか迷ったら"}</h2>
        <p>{user ? "レベルを選ぶと、前回の記録と次のレッスンを確認できます。" : "まずは初級のレッスンを体験。ログインせずに学習できます。"}</p></div>
      <Link className="pf-button" to={user ? "/review" : "/lesson/word-beginner-lesson-1"}>{user ? "単語を復習する" : "初級を試す"}<span aria-hidden="true">→</span></Link>
    </section>
    <section className="vs-section" aria-labelledby="vs-words-title">
      <div className="vs-section-heading"><div><h2 id="vs-words-title">単語</h2><p>日常のことばから、より豊かな表現へ。</p></div><span className="vs-muted">4 レベル</span></div>
      <Courses courses={vocabularyCourses} />
    </section>
    <section className="vs-section" aria-labelledby="vs-idioms-title">
      <div className="vs-section-heading"><div><h2 id="vs-idioms-title">熟語</h2><p>レベル別の練習で、表現に親しみましょう。</p></div><span className="vs-muted">4 レベル</span></div>
      <Courses courses={idiomCourses} />
    </section>
    <section className="vs-upcoming" aria-labelledby="vs-upcoming-title"><div><h2 id="vs-upcoming-title">専門分野のことば</h2><span className="vs-badge">準備中</span></div><p>専門分野のレッスンは、公開に向けて準備しています。</p><div className="vs-topic-list">{upcomingCourses.map((name) => <span key={name}>{name}</span>)}</div></section>
    <aside className="vs-tip"><strong>学び方のヒント</strong><p>定義を読んで意味をイメージし、例文を声に出してみましょう。最後のクイズで、覚えたことを確かめられます。</p></aside>
  </div>;
}
