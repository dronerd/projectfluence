import { Link } from "../lib/router-compat";
import { useAuth } from "../AuthContext";
import { vocabularyCourses, idiomCourses, specializedCourses, courseLessonNumbers, type VocabularyCourse } from "../lib/catalog";

function Courses({ courses }: { courses: VocabularyCourse[] }) {
  return <div className="vs-course-grid">{courses.map((course) => <Link className="vs-course" to={`/learn/${course.id}`} key={course.id}>
    <span className="vs-level">CEFR {course.level}</span>
    <h3>{course.title}</h3>
    <p>{course.description}</p>
    <span className="vs-course-footer">{courseLessonNumbers(course).length} レッスン <span aria-hidden="true">→</span></span>
  </Link>)}</div>;
}

export default function LearnGenres() {
  const { user } = useAuth();
  return <div className="vs-page">
    <header className="vs-page-heading">
      <p className="pf-eyebrow">VOCABULARY PRACTICE</p>
      <h1>レベルを選ぶ</h1>
      <p>画像ややさしい説明、例文で学び、クイズで確認します。</p>
    </header>
    <section className="vs-start-strip" aria-labelledby="vs-start-title">
      <div><h2 id="vs-start-title">{user ? "単語を復習" : "初めての方へ"}</h2>
        <p>{user ? "学習記録から復習できます。" : "ログインなしで体験できます。"}</p></div>
      <Link className="pf-button" to={user ? "/review" : "/lesson/word-beginner-lesson-1"}>{user ? "復習する" : "初級を試す"}</Link>
    </section>
    <section className="vs-section" aria-labelledby="vs-words-title">
      <div className="vs-section-heading"><div><h2 id="vs-words-title">単語</h2></div><span className="vs-muted">4 レベル</span></div>
      <Courses courses={vocabularyCourses} />
    </section>
    <section className="vs-section" aria-labelledby="vs-idioms-title">
      <div className="vs-section-heading"><div><h2 id="vs-idioms-title">熟語</h2></div><span className="vs-muted">4 レベル</span></div>
      <Courses courses={idiomCourses} />
    </section>
    <section className="vs-section" aria-labelledby="vs-specialized-title"><div className="vs-section-heading"><h2 id="vs-specialized-title">専門分野のことば</h2><span className="vs-muted">6 分野</span></div><p className="vs-muted">分野の入門に役立つ英語を学びます。表示レベルは英語の目安です。</p><Courses courses={specializedCourses} /></section>

  </div>;
}
