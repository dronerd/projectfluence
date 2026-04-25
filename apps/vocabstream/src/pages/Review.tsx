
// Review.tsxは、単語復習ページのコンポーネントであり、
// 復習機能を青色の単語学習ページと統合したため、現在は使用されていません。

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

type Lesson = { id: string; title: string; };
type LevelOrder = { [key: string]: string[] };

const STATIC_GENRES: Lesson[] = [
  { id: "word-intermediate", title: "単語初級~中級 (CEFR A2~B1)" },
  { id: "word-high-intermediate", title: "単語中上級 (CEFR B2)" },
  { id: "word-advanced", title: "単語上級 (CEFR C1)" },
  { id: "word-proficiency", title: "単語熟達 (CEFR C2)" },
  { id: "idioms-intermediate", title: "熟語初級~中級 (CEFR A2~B1)" },
  { id: "idioms-high-intermediate", title: "熟語中上級 (CEFR B2)" },
  { id: "idioms-advanced", title: "熟語上級 (CEFR C1)" },
  { id: "idioms-proficiency", title: "熟語熟達 (CEFR C2)" },
  { id: "business-entry", title: "入門レベル" },
  { id: "business-intermediate", title: "実践レベル" },
  { id: "business-global", title: "グローバルレベル" },
  { id: "computer-science", title: "Computer Science & Technology" },
  { id: "medicine", title: "Medicine & Health" },
  { id: "economics-business", title: "Business & Economics" },
  { id: "environment", title: "Environmental Science & Sustainability" },
  { id: "law", title: "Law" },
  { id: "politics", title: "Politics" },
  { id: "engineering", title: "Engineering" },
];

export default function LearnGenres() {
  const [genres] = useState<Lesson[]>(STATIC_GENRES);
  const [isSmall, setIsSmall] = useState<boolean>(false);
  const nav = useNavigate();

  useEffect(() => {
    function update() {
      if (typeof window === "undefined") return;
      setIsSmall(window.innerWidth <= 720);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const categories: Record<string, Lesson[]> = {
    単語: genres.filter((g) => g.id.startsWith("word")),
    熟語: genres.filter((g) => g.id.startsWith("idioms")),
    ビジネス表現: genres.filter((g) => g.id.startsWith("business")),
    専門用語: genres.filter(
      (g) =>
        !g.id.startsWith("word") &&
        !g.id.startsWith("idioms") &&
        !g.id.startsWith("business")
    ),
  };

  const lessonImages: Record<string, string> = {
    "computer-science": "/vocabstream/CS1.png",
    "medicine": "/vocabstream/Medicine.png",
    "politics": "/vocabstream/politics.png",
    "economics-business": "/vocabstream/Business.png",
    "environment": "/vocabstream/Environment.png",
    "engineering": "/vocabstream/Engineering.png",
    "law": "/vocabstream/Law.png",
  };

  const blueGradients = ["#f7bba6", "#f08f76", "#e46c50", "#cc573c"];
  const pageBackground = "#e5e7eb";

  const levelOrder: LevelOrder = {
    単語: [
      "word-intermediate",
      "word-high-intermediate",
      "word-advanced",
      "word-proficiency",
    ],
    熟語: [
      "idioms-intermediate",
      "idioms-high-intermediate",
      "idioms-advanced",
      "idioms-proficiency",
    ],
    ビジネス表現: [
      "business-entry",
      "business-intermediate",
      "business-global",
      "business-proficiency",
    ],
  };

  function cardBackground(categoryName: string, index: number) {
    if (categoryName === "単語" || categoryName === "熟語" || categoryName === "ビジネス表現") {
      return blueGradients[index] || blueGradients[blueGradients.length - 1];
    }
    const termColors = ["#f5deb3", "#d8bfd8", "#ffe4b5", "#c1ffc1", "#e6e6fa", "#afeeee", "#f08080"];
    return termColors[index % termColors.length];
  }

  const basePadding = isSmall ? 12 : 20;

  const allowedLessonIds = new Set([
    "word-intermediate",
    "word-high-intermediate",
    "word-advanced",
    "word-proficiency",
  ]);

  function handleLessonClick(lessonId: string) {
    const id = lessonId.toLowerCase();
    if (allowedLessonIds.has(id)) {
      nav(`/still_under_development`);
    } else {
      nav("/still_under_development");
    }
  }

  return (
    <div className="outer-root" style={{ backgroundColor: pageBackground }}>
      <style>{`
        /* global box sizing & remove default margins that cause bleed */
        *, *::before, *::after { box-sizing: border-box; }
        html, body, #root { height: 100%; margin: 0; padding: 0; overflow-x: hidden; background: ${pageBackground}; }

        /* outer wrapper fills vertical space but NOT using 100vw (avoids scroll issues) */
        .outer-root {
          min-height: 100vh;
          width: 100%;
          display: block;
          padding-left: env(safe-area-inset-left);
          padding-right: env(safe-area-inset-right);
          overflow-x: hidden;
        }

        /* center container with controlled max-width and auto margins */
        .main-container {
          max-width: 1100px; /* keep comfortable width */
          margin: 0 auto;    /* center */
          padding-inline: 16px; /* left & right padding that won't cause overflow */
          /* ensure safe-area padding + comfortable gutters so header/logo won't be clipped */
          padding-left: calc(env(safe-area-inset-left, 0px) + 16px);
          padding-right: calc(env(safe-area-inset-right, 0px) + 16px);
        }

        /* make sure flex/grid children can shrink (important to avoid overflow) */
        .main-container, .category-block, .lessons-grid, .lesson-card {
          min-width: 0;
        }

        /* responsive grid: cards wrap and never force horizontal scroll */
        .lessons-grid {
          display: grid;
          gap: 10px;
          /* each card will be at least 220px but can grow to fill row; auto-fit wraps */
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          width: 100%;
        }

        .category-block {
          margin-top: 10px;
          margin-bottom: 20px;
          padding: 12px;
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 12px;
          box-shadow: 0 6px 14px rgba(0,0,0,0.08);
        }

        .lesson-card {
          padding: 20px;
          border: 1px solid #ddd;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          transition: transform .14s cubic-bezier(.2,.9,.2,1), box-shadow .14s ease;
          box-shadow: 0 4px 10px rgba(0,0,0,0.04);
          overflow: hidden; /* prevent children overflowing */
        }

        /* ensure lesson image doesn't shrink and stays inside card */
        .lesson-card > img { display: block; max-width: 100%; height: auto; border-radius: 8px; flex-shrink: 0; }

        /* title behaviour: allow wrapping and breaking both on mobile and desktop */
        .lesson-title {
          display: block;
          font-weight: bold;
          overflow-wrap: anywhere; /* allows breaking long words or phrases */
          word-break: break-word;
          white-space: normal; /* IMPORTANT: allow multiple lines instead of truncation */
        }

        /* make sure logos/headers outside this component are not clipped on small screens
           If you have a header with class .site-header and an img.logo, these rules help prevent clipping */
        .site-header { box-sizing: border-box; padding-inline: 16px; }
        .site-header .logo { max-width: 100%; height: auto; display: block; }

        @media (hover: hover) {
          .lesson-card:hover {
            transform: translateY(-6px);
            box-shadow: 0 18px 36px rgba(0,0,0,0.12);
          }
          .lesson-card:focus-visible {
            outline: none;
            transform: translateY(-6px);
            box-shadow: 0 18px 36px rgba(0,0,0,0.12);
          }
        }

        @media (max-width: 720px) {
          .lessons-grid { grid-template-columns: 1fr; gap: 10px; }
        }
      `}</style>

      <div className="main-container" style={{ paddingTop: basePadding }}>
      
        <h2
          style={{
            fontSize: isSmall ? 24 : 32,
            fontWeight: 900, // 最大の太さ
            textAlign: "center",
            marginBottom: 10,
            color: "#1f2937"
          }}
        >
          単語の複習
        </h2>

        <h3 style={{ fontSize: isSmall ? 16 : 22, fontWeight: 600, textAlign: "center", marginBottom: 20, color: "#374151" }}>
         復習する分野の選択
        </h3>

        {Object.entries(categories).map(([categoryName, lessons]) => {
          const order = levelOrder[categoryName];
          if (order) {
            lessons.sort((a, b) => {
              const idxA = order.indexOf(a.id.toLowerCase());
              const idxB = order.indexOf(b.id.toLowerCase());
              const A = idxA === -1 ? 999 : idxA;
              const B = idxB === -1 ? 999 : idxB;
              return A - B;
            });
          }

          return (
            <div key={categoryName} className="category-block">
              <div style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: 10,
                  flexDirection: isSmall ? "column" : "row",
                  gap: isSmall ? 8 : 10,
                  textAlign: isSmall ? "center" : "left",
                }}>
                <h3 style={{ fontSize: isSmall ? 18 : 24, fontWeight: "bold", margin: 0, color: "#cc573c" }}>
                  {categoryName}
                </h3>
              </div>

              <div className="lessons-grid">
                {lessons.map((lesson, index) => (
                  <div
                    key={lesson.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleLessonClick(lesson.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleLessonClick(lesson.id);
                      }
                    }}
                    className="lesson-card"
                    style={{
                      background: cardBackground(categoryName, index),
                      color: "#592216",
                      fontWeight: "bold",
                      flexDirection: isSmall ? "column" : "row",
                      textAlign: isSmall ? "center" : "left",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      {categoryName === "専門用語" && (
                        <img
                          src={lessonImages[lesson.id.toLowerCase()] || "/images/default.jpg"}
                          alt={lesson.title}
                          style={{
                            width: isSmall ? 48 : 60,
                            height: isSmall ? 48 : 60,
                            objectFit: "cover",
                            borderRadius: 8,
                            flex: "0 0 auto",
                          }}
                        />
                      )}
                      {/* Use the lesson-title class so titles can wrap on multiple lines (mobile & desktop) */}
                      <strong className="lesson-title" style={{ fontSize: isSmall ? 15 : 15, minWidth: 0 }}>
                        {lesson.title}
                      </strong>
                    </div>
                    
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
