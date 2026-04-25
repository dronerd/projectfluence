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

  const blueGradients = [
    "linear-gradient(135deg, #f6f9fd 0%, #d9e6f7 100%)",
    "linear-gradient(135deg, #ebf2fb 0%, #c7daf4 100%)",
    "linear-gradient(135deg, #dce9fb 0%, #aac7f1 100%)",
    "linear-gradient(135deg, #cfe0f8 0%, #8eb1e7 100%)",
  ];
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
    const termColors = [
      "linear-gradient(135deg, #f3f6fb 0%, #d7e1f0 100%)",
      "linear-gradient(135deg, #eef3fb 0%, #c6d5eb 100%)",
      "linear-gradient(135deg, #f8fbff 0%, #d7e0ec 100%)",
      "linear-gradient(135deg, #ebf1f9 0%, #bccfe4 100%)",
    ];
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
      nav(`/learn/${lessonId}`);
    } else {
      nav("/still_under_development");
    }
  }

  return (
    <div className="outer-root" style={{ backgroundColor: pageBackground }}>
      <style>{`
        /* global box sizing & remove default margins that cause bleed */
        *, *::before, *::after { box-sizing: border-box; }
        html, body, #root { height: 100%; margin: 0; padding: 0; overflow-x: hidden; background: #e5e7eb; }

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
          max-width: 1180px;
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
          margin-top: 14px;
          margin-bottom: 24px;
          padding: 18px;
          background: linear-gradient(180deg, rgba(248,251,255,0.98), rgba(233,240,248,0.96));
          border: 1px solid rgba(154,176,208,0.22);
          border-radius: 24px;
          box-shadow: 0 22px 60px rgba(5,13,30,0.34);
        }

        .lesson-card {
          padding: 20px;
          border: 1px solid #d1d5db;
          border-radius: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          transition: transform .14s cubic-bezier(.2,.9,.2,1), box-shadow .14s ease;
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
          overflow: hidden; /* prevent children overflowing */
          background: #ffffff;
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
          単語の学習
        </h2>

        <h3 style={{ fontSize: isSmall ? 16 : 22, fontWeight: 600, textAlign: "center", marginBottom: 24, color: "#374151" }}>
          学習する分野の選択
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
                <h3 style={{ fontSize: isSmall ? 18 : 24, fontWeight: "bold", margin: 0, color: "#173a71" }}>
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
                      color: "#10203b",
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
