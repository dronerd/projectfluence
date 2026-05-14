"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useCallback, useState } from "react";

type Props = {
  pathname: string;
};

type VidMatchVideo = {
  video_id: string;
  title: string;
  channel_name: string;
  youtube_url: string;
  thumbnail_url: string | null;
  duration: string | null;
  level: string;
  skills: string[];
  topics: string[];
  accent: string | null;
  transcript_available: boolean;
  description: string | null;
  tags: string[];
  quality_score: number;
};

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const SKILLS = ["listening", "vocabulary", "pronunciation", "grammar", "conversation"];
const TOPICS = [
  "Computer Science & Technology",
  "Medicine & Health",
  "Business & Economics",
  "Environmental Science & Sustainability",
  "Law & Politics",
  "Engineering",
  "Art & Culture",
];
const ACCENTS = ["American", "British", "Australian", "Canadian"];

const featureCards = [
  {
    title: "語彙レベルに合う動画",
    copy: "VocabStreamで学んだ単語や現在のCEFRレベルを手がかりに、理解しやすい英語動画を探しやすくします。",
  },
  {
    title: "分野別インプット",
    copy: "ビジネス、テクノロジー、環境、医療など、伸ばしたい専門分野に合わせて動画学習へ進めます。",
  },
  {
    title: "英語を英語のまま理解",
    copy: "日本語字幕に頼りすぎず、文脈・音声・表現を結びつけながら自然なインプット量を増やします。",
  },
];

export default function VidMatchApp({ pathname }: Props) {
  const [selectedLevel, setSelectedLevel] = useState("B1");
  const [selectedSkills, setSelectedSkills] = useState<string[]>(["listening"]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [customTopics, setCustomTopics] = useState("");
  const [selectedAccent, setSelectedAccent] = useState("");
  const [captionOnly, setCaptionOnly] = useState(false);
  const [recommendations, setRecommendations] = useState<VidMatchVideo[]>([]);
  const [recommendationError, setRecommendationError] = useState("");
  const [recommendationLoading, setRecommendationLoading] = useState(false);

  const scrollToTop = useCallback(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const isNestedRoute = pathname !== "/";

  const toggleValue = (value: string, values: string[], setValues: React.Dispatch<React.SetStateAction<string[]>>) => {
    setValues(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  };

  const getTopicsForRequest = () => {
    const typedTopics = customTopics
      .split(",")
      .map((topic) => topic.trim())
      .filter(Boolean);

    return Array.from(new Set([...selectedTopics, ...typedTopics]));
  };

  const fetchRecommendations = async () => {
    setRecommendationLoading(true);
    setRecommendationError("");

    const params = new URLSearchParams({
      level: selectedLevel,
      limit: "6",
    });

    selectedSkills.forEach((skill) => params.append("skills", skill));
    getTopicsForRequest().forEach((topic) => params.append("topics", topic));
    if (selectedAccent) params.set("accent", selectedAccent);
    if (captionOnly) params.set("transcript_available", "true");

    try {
      const response = await fetch(`/api/vidmatch/recommend?${params}`);
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Recommendation request failed");
      }

      setRecommendations(data.videos ?? []);
    } catch (error) {
      console.error(error);
      setRecommendationError("推薦を取得できませんでした。少し時間をおいて再試行してください。");
      setRecommendations([]);
    } finally {
      setRecommendationLoading(false);
    }
  };

  return (
    <div className="vidmatch-shell">
      <style>{`
        .vidmatch-shell {
          min-height: 100vh;
          background: #e5e5e5;
          color: #10203b;
          overflow-x: hidden;
        }

        .app-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 1000;
          background: linear-gradient(90deg, #4f46e5 0%, #06b6d4 100%);
          backdrop-filter: blur(18px);
          padding: 6px 0;
          border-bottom: 1px solid rgba(158, 180, 210, 0.16);
          width: 100%;
          box-sizing: border-box;
          overflow-x: hidden;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.22);
        }

        .app-header-inner {
          position: relative;
          width: 100%;
          max-width: 1280px;
          margin: 0 auto;
          padding: 0 18px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 14px;
          min-height: 52px;
          box-sizing: border-box;
        }

        .header-left,
        .header-right {
          position: relative;
          display: flex;
          gap: 10px;
          align-items: center;
          z-index: 3;
        }

        .header-right {
          justify-self: end;
        }

        .header-center {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          z-index: 2;
          width: min(48%, 560px);
          text-align: center;
        }

        .header-pill,
        .header-icon-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          min-height: 38px;
          padding: 0 10px;
          border-radius: 999px;
          text-decoration: none;
          font-weight: 700;
          border: 1px solid rgba(158, 180, 210, 0.16);
          box-shadow: 0 12px 28px rgba(3, 8, 20, 0.18);
          transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease;
        }

        .header-pill:hover,
        .header-pill:focus,
        .header-icon-btn:hover,
        .header-icon-btn:focus {
          transform: translateY(-2px);
          box-shadow: 0 16px 32px rgba(3, 8, 20, 0.24);
          border-color: rgba(158, 180, 210, 0.28);
          outline: none;
        }

        .project-pill {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(235, 242, 251, 0.92));
          color: #0b1730;
        }

        .vocab-pill,
        .header-icon-btn {
          background: rgba(17, 31, 61, 0.72);
          color: #edf4ff;
        }

        .vocab-title-link {
          display: inline-flex;
          flex-direction: column;
          gap: 3px;
          text-decoration: none;
          color: #f7fbff;
        }

        .vocab-overline {
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: white;
        }

        .vocab-title {
          margin: 0;
          font-weight: 800;
          color: #f7fbff;
          font-size: clamp(18px, 2.6vw, 26px);
          line-height: 1.05;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .brand-icon {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          object-fit: cover;
          display: block;
          box-shadow: 0 8px 18px rgba(3, 8, 20, 0.18);
        }

        .vocab-pill img {
          width: 32px;
          height: 32px;
          border-radius: 9px;
          object-fit: cover;
          flex-shrink: 0;
        }

        .vidmatch-main {
          width: 100%;
          max-width: 1180px;
          margin: 0 auto;
          padding: 104px 16px 96px;
          box-sizing: border-box;
        }

        .vidmatch-hero,
        .vidmatch-section {
          background: #ffffff;
          border: 1px solid rgba(209, 213, 219, 0.8);
          border-radius: 16px;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
        }

        .vidmatch-hero {
          padding: 24px;
        }

        .vidmatch-heading {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 16px;
        }

        .vidmatch-logo-large {
          width: 62px;
          height: 62px;
          border-radius: 12px;
          object-fit: cover;
          flex: 0 0 auto;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
        }

        .vidmatch-h1 {
          margin: 0;
          color: #1f2937;
          font-size: clamp(30px, 5vw, 54px);
          line-height: 1;
          font-weight: 900;
        }

        .vidmatch-copy {
          max-width: 760px;
          color: #334155;
          font-size: 16px;
          line-height: 1.8;
        }

        .vidmatch-section {
          margin-top: 24px;
          padding: 22px;
        }

        .vidmatch-section h2 {
          margin: 0 0 14px;
          color: #173a71;
          font-size: 24px;
          font-weight: 900;
        }

        .vidmatch-card-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .vidmatch-preferences {
          display: grid;
          gap: 20px;
        }

        .preference-group {
          display: grid;
          gap: 10px;
        }

        .preference-label {
          color: #10203b;
          font-size: 15px;
          font-weight: 900;
        }

        .chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .choice-chip,
        .recommend-button,
        .youtube-link {
          border: 1px solid #d1d5db;
          border-radius: 18px;
          min-height: 42px;
          padding: 0 16px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
          transition: transform 140ms cubic-bezier(0.2, 0.9, 0.2, 1), box-shadow 140ms ease,
            border-color 140ms ease, background 140ms ease, color 140ms ease;
        }

        .choice-chip {
          background: #ffffff;
          color: #334155;
        }

        .choice-chip:hover,
        .choice-chip:focus {
          transform: translateY(-6px);
          border-color: #b8c4d6;
          box-shadow: 0 18px 36px rgba(15, 23, 42, 0.12);
          outline: none;
        }

        .choice-chip.is-selected {
          background: linear-gradient(90deg, #4f46e5, #06b6d4);
          border-color: transparent;
          box-shadow: 0 12px 30px rgba(79, 70, 229, 0.18);
          color: #ffffff;
          transform: scale(1.02);
        }

        .choice-chip.is-selected:hover,
        .choice-chip.is-selected:focus {
          border-color: transparent;
          box-shadow: 0 18px 36px rgba(79, 70, 229, 0.22);
        }

        .caption-toggle {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          width: fit-content;
          color: #334155;
          font-weight: 800;
          cursor: pointer;
        }

        .caption-toggle input {
          width: 18px;
          height: 18px;
          accent-color: #4f46e5;
        }

        .custom-topic-input {
          width: 100%;
          min-height: 44px;
          border: 1px solid #d1d5db;
          border-radius: 14px;
          padding: 0 14px;
          color: #10203b;
          background: #ffffff;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
          font: inherit;
          font-weight: 700;
          box-sizing: border-box;
        }

        .custom-topic-input:focus {
          border-color: #4f46e5;
          box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.16);
          outline: none;
        }

        .recommend-actions {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }

        .recommend-button {
          background: linear-gradient(90deg, #4f46e5, #06b6d4);
          border-color: transparent;
          box-shadow: 0 12px 30px rgba(79, 70, 229, 0.18);
          color: #ffffff;
        }

        .recommend-button:hover,
        .recommend-button:focus,
        .youtube-link:hover,
        .youtube-link:focus {
          transform: translateY(-6px);
          border-color: transparent;
          box-shadow: 0 18px 36px rgba(79, 70, 229, 0.22);
          outline: none;
        }

        .recommend-button:disabled {
          cursor: wait;
          opacity: 0.72;
          transform: none;
          box-shadow: 0 12px 30px rgba(79, 70, 229, 0.18);
        }

        .recommend-error,
        .empty-recommendations {
          color: #b42318;
          font-weight: 800;
        }

        .empty-recommendations {
          color: #475569;
        }

        .recommendation-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          margin-top: 18px;
        }

        .recommendation-card {
          min-width: 0;
          overflow: hidden;
          border: 1px solid #d1d5db;
          border-radius: 14px;
          background: #ffffff;
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
        }

        .recommendation-thumb {
          display: block;
          width: 100%;
          aspect-ratio: 16 / 9;
          object-fit: cover;
          background: #d7e0ec;
        }

        .recommendation-body {
          display: grid;
          gap: 10px;
          padding: 16px;
        }

        .recommendation-title {
          margin: 0;
          color: #10203b;
          font-size: 18px;
          line-height: 1.35;
          font-weight: 900;
        }

        .recommendation-meta,
        .recommendation-description {
          margin: 0;
          color: #475569;
          line-height: 1.6;
        }

        .recommendation-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .recommendation-tag {
          border-radius: 999px;
          background: #e0f2fe;
          color: #075985;
          font-size: 12px;
          font-weight: 800;
          padding: 5px 9px;
        }

        .youtube-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: fit-content;
          min-height: 40px;
          background: linear-gradient(90deg, #4f46e5, #06b6d4);
          border-color: transparent;
          box-shadow: 0 12px 30px rgba(79, 70, 229, 0.18);
          color: #ffffff;
          text-decoration: none;
        }

        .vidmatch-feature-card {
          min-width: 0;
          padding: 18px;
          border: 1px solid #d1d5db;
          border-radius: 14px;
          background: linear-gradient(135deg, #f8fbff 0%, #d7e0ec 100%);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }

        .vidmatch-feature-card h3 {
          margin: 0 0 8px;
          color: #10203b;
          font-size: 17px;
          font-weight: 900;
        }

        .vidmatch-feature-card p,
        .vidmatch-section p {
          margin: 0;
          color: #334155;
          line-height: 1.75;
          overflow-wrap: anywhere;
        }

        .vidmatch-notice {
          margin-top: 16px;
          color: #173a71;
          font-weight: 800;
        }

        @media (max-width: 820px) {
          .app-header-inner {
            grid-template-columns: auto 1fr auto;
            padding: 0 14px;
            min-height: 52px;
          }

          .header-center {
            position: absolute;
            transform: translate(-50%, -50%);
            width: min(46%, 360px);
            text-align: center;
            padding-left: 0;
          }

          .header-right {
            justify-self: end;
          }

          .project-pill span,
          .vocab-pill span,
          .header-icon-btn span {
            display: none;
          }

          .vidmatch-main {
            padding-top: 126px;
          }

          .vidmatch-card-grid {
            grid-template-columns: 1fr;
          }

          .recommendation-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 560px) {
          .app-header-inner {
            gap: 10px;
            min-height: 52px;
          }

          .header-left,
          .header-right {
            gap: 8px;
          }

          .vocab-pill {
            padding: 0 8px;
          }

          .vidmatch-main {
            padding-left: 12px;
            padding-right: 12px;
          }

          .vidmatch-hero,
          .vidmatch-section {
            padding: 18px;
          }

          .vidmatch-heading {
            align-items: flex-start;
          }

          .vidmatch-copy {
            font-size: 14px;
          }
        }
      `}</style>

      <header className="app-header" role="banner">
        <div className="app-header-inner">
          <div className="header-left">
            <a href="/" className="header-pill project-pill" aria-label="Project Fluence landing page">
              <img src="/images/logo.png" alt="Project Fluence" className="brand-icon" />
              <span>Project Fluence</span>
            </a>
          </div>

          <div className="header-center">
            <Link href="/vidmatch" className="vocab-title-link" onClick={scrollToTop}>
              <span className="vocab-overline">動画推薦アプリ</span>
              <h1 className="vocab-title">VidMatch</h1>
            </Link>
          </div>

          <div className="header-right" aria-hidden="true" />
        </div>
      </header>

      <main className="vidmatch-main">
        <section className="vidmatch-hero" aria-labelledby="vidmatch-title">
          <div className="vidmatch-heading">
            <Image
              src="/images/videofinder.png"
              alt="VidMatch"
              width={62}
              height={62}
              className="vidmatch-logo-large"
            />
            <h2 id="vidmatch-title" className="vidmatch-h1">
              VidMatch
            </h2>
          </div>

          <p className="vidmatch-copy">
            VidMatchは、YouTube動画を英語レベル・語彙・分野に基づいて推薦する学習エンジンです。
            いまの自分に合った英語インプットを増やし、聞き取れる表現と使える語彙を自然に広げることを目指します。
          </p>

          <p className="vidmatch-copy" style={{ marginTop: 14 }}>
            Project Fluenceの他アプリと連携し、VocabStreamで学んだ語彙や興味分野をもとに、
            理解しやすく、少し背伸びできる動画へ案内します。
          </p>

          {isNestedRoute && (
            <p className="vidmatch-notice">
              このページは現在ホームに集約されています。
            </p>
          )}
        </section>

        <section className="vidmatch-section" aria-labelledby="vidmatch-features-title">
          <h2 id="vidmatch-features-title">VidMatchでできること</h2>
          <div className="vidmatch-card-grid">
            {featureCards.map((feature) => (
              <article key={feature.title} className="vidmatch-feature-card">
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="vidmatch-section" aria-labelledby="vidmatch-recommend-title">
          <h2 id="vidmatch-recommend-title">動画を探す</h2>

          <div className="vidmatch-preferences">
            <div className="preference-group">
              <span className="preference-label">レベル</span>
              <div className="chip-row" role="group" aria-label="Choose English level">
                {LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={`choice-chip ${selectedLevel === level ? "is-selected" : ""}`}
                    onClick={() => setSelectedLevel(level)}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div className="preference-group">
              <span className="preference-label">伸ばしたいスキル</span>
              <div className="chip-row" role="group" aria-label="Choose skills">
                {SKILLS.map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    className={`choice-chip ${selectedSkills.includes(skill) ? "is-selected" : ""}`}
                    onClick={() => toggleValue(skill, selectedSkills, setSelectedSkills)}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>

            <div className="preference-group">
              <span className="preference-label">トピック</span>
              <div className="chip-row" role="group" aria-label="Choose topics">
                {TOPICS.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    className={`choice-chip ${selectedTopics.includes(topic) ? "is-selected" : ""}`}
                    onClick={() => toggleValue(topic, selectedTopics, setSelectedTopics)}
                  >
                    {topic}
                  </button>
                ))}
              </div>
              <input
                type="text"
                className="custom-topic-input"
                value={customTopics}
                onChange={(event) => setCustomTopics(event.target.value)}
                placeholder="自分のトピックを入力（複数の場合はカンマで区切る）"
                aria-label="Enter custom topics"
              />
            </div>

            <div className="preference-group">
              <span className="preference-label">アクセント</span>
              <div className="chip-row" role="group" aria-label="Choose accent">
                <button
                  type="button"
                  className={`choice-chip ${selectedAccent === "" ? "is-selected" : ""}`}
                  onClick={() => setSelectedAccent("")}
                >
                  any
                </button>
                {ACCENTS.map((accent) => (
                  <button
                    key={accent}
                    type="button"
                    className={`choice-chip ${selectedAccent === accent ? "is-selected" : ""}`}
                    onClick={() => setSelectedAccent(accent)}
                  >
                    {accent}
                  </button>
                ))}
              </div>
            </div>

            <label className="caption-toggle">
              <input
                type="checkbox"
                checked={captionOnly}
                onChange={(event) => setCaptionOnly(event.target.checked)}
              />
              字幕・文字起こしあり
            </label>

            <div className="recommend-actions">
              <button
                type="button"
                className="recommend-button"
                onClick={fetchRecommendations}
                disabled={recommendationLoading}
              >
                {recommendationLoading ? "検索中..." : "おすすめを見る"}
              </button>
              {recommendationError && <span className="recommend-error">{recommendationError}</span>}
            </div>
          </div>

          {recommendations.length > 0 && (
            <div className="recommendation-grid" aria-live="polite">
              {recommendations.map((video) => (
                <article key={video.video_id} className="recommendation-card">
                  {video.thumbnail_url && (
                    <img src={video.thumbnail_url} alt="" className="recommendation-thumb" loading="lazy" />
                  )}
                  <div className="recommendation-body">
                    <h3 className="recommendation-title">{video.title}</h3>
                    <p className="recommendation-meta">
                      {video.channel_name} / {video.level} / score {Math.round(Number(video.quality_score))}
                    </p>
                    <div className="recommendation-tags">
                      {[...video.skills, ...video.topics].slice(0, 6).map((tag) => (
                        <span key={`${video.video_id}-${tag}`} className="recommendation-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                    {video.description && (
                      <p className="recommendation-description">
                        {video.description.length > 150 ? `${video.description.slice(0, 150)}...` : video.description}
                      </p>
                    )}
                    <a className="youtube-link" href={video.youtube_url} target="_blank" rel="noreferrer">
                      YouTubeで見る
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!recommendationLoading && recommendations.length === 0 && (
            <p className="empty-recommendations" style={{ marginTop: 16 }}>
              条件を選んで、おすすめ動画を表示できます。
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
