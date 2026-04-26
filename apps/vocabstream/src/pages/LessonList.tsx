import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

type Lesson = {
  id: string;
  title: string;
};

const STATIC_GENRE_TITLES: Record<string, string> = {
  "word-intermediate": "初級~中級 (CEFR A2~B1)",
  "word-high-intermediate": "中上級 (CEFR B2)",
  "word-advanced": "上級 (CEFR C1)",
  "word-proficiency": "熟達 (CEFR C2)",
  "idioms-intermediate": "初級~中級 (CEFR A2~B1)",
  "idioms-high-intermediate": "中上級 (CEFR B2)",
  "idioms-advanced": "上級 (CEFR C1)",
  "idioms-proficiency": "熟達 (CEFR C2)",
  "business-entry": "入門レベル",
  "business-intermediate": "実践レベル",
  "business-global": "グローバルレベル",
  "computer-science": "コンピューターサイエンス・テクノロジー",
  "medicine": "医学・健康",
  "economics-business": "ビジネス・経済",
  "environment": "環境科学・サステナビリティ",
  "law": "法律",
  "politics": "政治",
  "engineering": "工学",
};

function makeLessons(genreId: string, count: number): Lesson[] {
  const arr: Lesson[] = [];
  for (let i = 1; i <= count; i++) arr.push({ id: `${genreId}-lesson-${i}`, title: `Lesson ${i}` });
  return arr;
}

const LESSON_COUNT_BY_GENRE: Record<string, number> = {
  "word-intermediate": 64,
  "word-high-intermediate": 96,
  "word-advanced": 100,
  "word-proficiency": 100,
  "idioms-intermediate": 50,
  "idioms-high-intermediate": 50,
  "idioms-advanced": 50,
  "idioms-proficiency": 50,
  "business-entry": 71,
  "business-intermediate": 71,
  "business-global": 71,
  "computer-science": 71,
  "medicine": 71,
  "economics-business": 71,
  "environment": 71,
  "law": 71,
  "politics": 71,
  "engineering": 71,
};

export default function LessonList() {
  const { genreId } = useParams<{ genreId: string }>();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [genreTitle, setGenreTitle] = useState<string>("");
  const nav = useNavigate();

  useEffect(() => {
    if (!genreId) return;
    setGenreTitle(STATIC_GENRE_TITLES[genreId] || genreId);
    const count = LESSON_COUNT_BY_GENRE[genreId] ?? 10;
    setLessons(makeLessons(genreId, count));
  }, [genreId]);

  if (!genreId)
    return (
      <div className="page-root">
        <h2 className="page-title">学習分野が指定されていません</h2>
        <button className="back-btn" onClick={() => nav("/learn")}>← 戻る</button>
        <style>{styles}</style>
      </div>
    );

  return (
    <div className="page-root">
      <h2 className="page-title">{genreTitle} - レッスン一覧</h2>
      <button className="back-btn" onClick={() => nav("/learn")}>← 戻る</button>

      <div className="lessons-grid">
        {lessons.map((l) => (
          <article
            key={l.id}
            className="lesson-card"
            onClick={() => nav(`/lesson/${l.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && nav(`/lesson/${l.id}`)}
          >
            <div className="lesson-content">
              <div className="lesson-title">{l.title}</div>
            </div>

            <button
              className="start-btn"
              onClick={(ev) => {
                ev.stopPropagation();
                nav(`/lesson/${l.id}`);
              }}
            >
              開始
            </button>
          </article>
        ))}
      </div>

      <style>{styles}</style>
    </div>
  );
}

const styles = `
/* Global box sizing and reset to avoid overflow due to element sizing */
*,
*::before,
*::after {
  box-sizing: border-box;
}

/* Ensure full background coverage and prevent horizontal scroll */
html, body, #root {
  margin: 0;
  padding: 0;
  background: #e5e5e5;
  width: 100%;
  height: 100%;
  overflow-x: hidden;
}

/* Page layout */
:root{
  --card-gap: 10px;
  --card-radius: 10px;
  --card-padding: 12px;
  --blue-900: #173a71;
  --blue-700: #2b65b1;
  --blue-500: #6b93d6;
  --cyan-400: #73c9dc;
}

.page-root {
  padding: 20px 16px 32px;
  font-family: Inter, Arial, sans-serif;
  background: #e5e5e5;
  min-height: 100vh;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow-x: hidden;
}

/* Title */
.page-title {
  font-size: 28px;
  margin: 0 auto 10px;
  color: var(--blue-900);
  text-align: center;
  font-weight: 900;
  line-height: 1.25;
  max-width: 920px;
}

/* Back button */
.back-btn {
  display: block;
  margin: 0 auto 18px auto;
  padding: 10px 20px;
  border-radius: 999px;
  border: 1px solid rgba(43, 101, 177, 0.22);
  background: linear-gradient(135deg, #f4f8ff 0%, #d3e5fb 100%);
  color: #12366d;
  font-weight: 800;
  font-size: 15px;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.1);
  transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
}
.back-btn:hover {
  transform: translateY(-2px);
  filter: saturate(1.03);
  box-shadow: 0 14px 24px rgba(15, 23, 42, 0.14);
}


/* Grid - use flex-start to avoid uneven spacing rounding issues that can cause overflow */
.lessons-grid {
  display: grid;
  gap: var(--card-gap);
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  margin: 0 auto;
  padding: 0;
  width: 100%;
  max-width: 1100px;
}

/* Lesson Card */
.lesson-card {
  background: linear-gradient(135deg, #f4f8ff 0%, #d3e5fb 100%);
  border: 1px solid #d1d5db;
  border-radius: 18px;
  padding: var(--card-padding);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  transition: transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease;
  cursor: pointer;
  min-width: 100px;
  min-height: 118px;
  position: relative;
  overflow: hidden;
}

.lesson-card::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 4px;
  background: linear-gradient(90deg, var(--blue-700), var(--cyan-400));
}

.lesson-card:nth-child(4n + 2) {
  background: linear-gradient(135deg, #e9f2ff 0%, #bfd8f8 100%);
}

.lesson-card:nth-child(4n + 3) {
  background: linear-gradient(135deg, #eff7ff 0%, #cde1f6 100%);
}

.lesson-card:nth-child(4n) {
  background: linear-gradient(135deg, #edf6ff 0%, #c5e2f5 100%);
}

/* Hover */
.lesson-card:hover {
  transform: translateY(-6px);
  border-color: rgba(43, 101, 177, 0.46);
  box-shadow: 0 18px 36px rgba(0,0,0,0.12);
}

.lesson-content { padding: 0; }
.lesson-title {
  font-size: 18px;
  font-weight: 900;
  margin: 8px 0 14px;
  color: #102a56;
  letter-spacing: 0;
}
.lesson-meta { font-size: 14px; color: #6b7280; }

/* Start Button inside card */
.start-btn {
  width: 100%;
  border: none;
  background: linear-gradient(135deg, #2760a8 0%, #5687cc 70%, #42a8c4 100%);
  padding: 10px 0;
  font-size: 15px;
  font-weight: 800;
  color: #ffffff;
  cursor: pointer;
  border-radius: 999px;
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.18);
  transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
}
.start-btn:hover {
  filter: brightness(1.04);
  transform: translateY(-1px);
  box-shadow: 0 12px 20px rgba(15, 23, 42, 0.22);
}

/* Responsive tweaks */
@media (min-width: 1200px) {
  :root { --card-gap: 10px; --card-padding: 14px; }
  .lesson-card { min-height: 122px; }
}

@media (min-width: 900px) and (max-width: 1199px) {
  .lesson-card { min-height: 120px; }
}

/* Mobile adjustments */
@media (max-width: 520px) {
  .page-root {
    padding-left: 12px;
    padding-right: 12px;
    padding-top: 12px;
  }
  .page-title { font-size: 22px; }
  .back-btn { margin-bottom: 14px; }
  .lessons-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .lesson-card {
    padding: 10px;
    min-height: 108px;
  }
  .lesson-title { font-size: 14px; }
  .lesson-meta { font-size: 12px; }
  .start-btn { font-size: 13px; padding: 10px 0; }
}

/* Touch devices: disable hover effects */
@media (hover: none) {
  .lesson-card:hover { transform: none; }
}
`;
