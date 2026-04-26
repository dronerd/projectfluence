"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useCallback } from "react";

type Props = {
  pathname: string;
};

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
  const scrollToTop = useCallback(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const isNestedRoute = pathname !== "/";

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
          padding: 8px 0;
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
          min-height: 56px;
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
          min-height: 46px;
          padding: 0 14px;
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
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: white;
        }

        .vocab-title {
          margin: 0;
          font-weight: 800;
          color: #f7fbff;
          font-size: clamp(20px, 3vw, 30px);
          line-height: 1.05;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .brand-icon {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          object-fit: cover;
          display: block;
          box-shadow: 0 8px 18px rgba(3, 8, 20, 0.18);
        }

        .vocab-pill img {
          width: 38px;
          height: 38px;
          border-radius: 11px;
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
            grid-template-columns: auto 1fr;
            padding: 4px 14px;
          }

          .header-center {
            position: static;
            transform: none;
            width: 100%;
            order: 3;
            text-align: left;
            padding-left: 6px;
          }

          .header-right {
            justify-self: end;
          }

          .project-pill span,
          .header-icon-btn span {
            display: none;
          }

          .vidmatch-main {
            padding-top: 126px;
          }

          .vidmatch-card-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 560px) {
          .app-header-inner {
            gap: 10px;
            min-height: 72px;
          }

          .header-left,
          .header-right {
            gap: 8px;
          }

          .vocab-pill {
            padding: 0 10px;
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

          <div className="header-right">
            <Link href="/vidmatch" className="header-pill vocab-pill" onClick={scrollToTop} aria-label="VidMatch home">
              <img src="/images/videofinder.png" alt="VidMatch logo" />
              <span>Home</span>
            </Link>
          </div>
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
      </main>
    </div>
  );
}
