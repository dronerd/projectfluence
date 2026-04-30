"use client";

import AIChat from "./pages/AI_chat";
import { Navigate } from "./lib/router-compat";

type Props = {
  pathname: string;
};

function SpeakWiseHeader() {
  return (
    <header className="speakwise-header" role="banner">
      <div className="speakwise-header-inner">
        <div className="speakwise-header-left">
          <a
            href="/"
            className="speakwise-pill speakwise-project-pill"
            aria-label="Project Fluence landing page"
          >
            <img src="/images/logo.png" alt="Project Fluence" className="speakwise-brand-icon" />
            <span>Project Fluence</span>
          </a>
        </div>

        <div className="speakwise-header-center">
          <a href="/speakwise" className="speakwise-title-link" aria-label="SpeakWise home">
            <span className="speakwise-overline">英会話アプリ</span>
            <h1 className="speakwise-title">SpeakWiseAI</h1>
          </a>
        </div>

        <div className="speakwise-header-right">
          <a
            href="/speakwise"
            className="speakwise-pill speakwise-app-pill"
            aria-label="SpeakWise home page"
          >
            <img src="/images/speakwise.png" alt="SpeakWise logo" />
            <span>Home</span>
          </a>
        </div>
      </div>
    </header>
  );
}

export default function SpeakWiseApp({ pathname }: Props) {
  if (pathname !== "/") {
    return <Navigate to="/" />;
  }

  return (
    <>
      <style>{`
        :root {
          --sw-bg: #081225;
          --sw-bg-soft: #13233f;
          --sw-panel: rgba(247, 250, 252, 0.96);
          --sw-panel-strong: #ffffff;
          --sw-border: rgba(125, 151, 191, 0.22);
          --sw-text: #dbe7f5;
          --sw-text-dark: #0f1d35;
          --sw-muted: #6c7c93;
          --sw-primary: #5e9df6;
          --sw-primary-strong: #2f6fda;
          --sw-shadow: 0 20px 55px rgba(4, 10, 24, 0.34);
        }

        html,
        body,
        #__next {
          background: #e5e7eb;
          color: var(--sw-text);
        }

        body {
          margin: 0;
          min-height: 100vh;
          font-family: Inter, Arial, sans-serif;
        }

        .speakwise-shell {
          min-height: 100vh;
          background: #e5e7eb;
          color: var(--sw-text);
        }

        .speakwise-content {
          min-height: 100vh;
          padding: 96px 16px 96px;
        }

        .speakwise-header {
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
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.22);
        }

        .speakwise-header-inner {
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

        .speakwise-header-left,
        .speakwise-header-right {
          display: flex;
          align-items: center;
          gap: 10px;
          z-index: 2;
        }

        .speakwise-header-right {
          justify-self: end;
        }

        .speakwise-header-center {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: min(48%, 560px);
          text-align: center;
          z-index: 1;
        }

        .speakwise-pill {
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
          transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
        }

        .speakwise-pill:hover,
        .speakwise-pill:focus {
          transform: translateY(-2px);
          box-shadow: 0 16px 32px rgba(3, 8, 20, 0.24);
          border-color: rgba(158, 180, 210, 0.28);
          outline: none;
        }

        .speakwise-project-pill {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(235, 242, 251, 0.92));
          color: #0b1730;
        }

        .speakwise-app-pill {
          background: rgba(17, 31, 61, 0.72);
          color: #edf4ff;
        }

        .speakwise-title-link {
          display: inline-flex;
          flex-direction: column;
          gap: 3px;
          text-decoration: none;
          color: #f7fbff;
        }

        .speakwise-overline {
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: white;
        }

        .speakwise-title {
          margin: 0;
          font-weight: 800;
          color: #f7fbff;
          font-size: clamp(20px, 3vw, 30px);
          line-height: 1.05;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .speakwise-subtitle {
          font-size: 12px;
          color: #aebed5;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .speakwise-brand-icon {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          object-fit: cover;
          display: block;
          box-shadow: 0 8px 18px rgba(3, 8, 20, 0.18);
        }

        .speakwise-app-pill img {
          width: 38px;
          height: 38px;
          border-radius: 11px;
          object-fit: cover;
          flex-shrink: 0;
        }

        .speakwise-shell .app-container {
          min-height: calc(100vh - 192px);
          width: 100%;
          max-width: 920px;
          margin: 0 auto;
          padding: 24px 0 48px;
        }

        .speakwise-shell .card {
          width: 100%;
          background: linear-gradient(180deg, rgba(250, 252, 255, 0.98), rgba(237, 243, 250, 0.96));
          color: var(--sw-text-dark);
          border: 1px solid var(--sw-border);
          border-radius: 24px;
          box-shadow: var(--sw-shadow);
        }

        .speakwise-shell .lead {
          color: var(--sw-muted);
        }

        .speakwise-shell .btn-accent {
          padding: 10px 18px;
          background: linear-gradient(180deg, rgba(248, 251, 255, 0.96), rgba(228, 237, 248, 0.92));
          border: 1px solid rgba(133, 155, 189, 0.28);
          color: #123058;
          border-radius: 12px;
          box-shadow: 0 10px 22px rgba(8, 18, 37, 0.12);
          font-weight: 700;
        }

        .hide-global-navs .speakwise-header {
          display: none !important;
        }

        .hide-global-navs .speakwise-content {
          padding-top: 12px;
        }

        @media (max-width: 820px) {
          .speakwise-header-inner {
            grid-template-columns: auto 1fr;
            padding: 4px 14px;
          }

          .speakwise-header-center {
            position: static;
            transform: none;
            width: 100%;
            order: 3;
            text-align: left;
            padding-left: 6px;
          }

          .speakwise-project-pill span,
          .speakwise-app-pill span {
            display: none;
          }
        }

        @media (max-width: 560px) {
          .speakwise-header-inner {
            gap: 10px;
            min-height: 72px;
          }

          .speakwise-subtitle {
            display: none;
          }

          .speakwise-content {
            padding-inline: 12px;
          }
        }
      `}</style>
      <div className="speakwise-shell">
        <SpeakWiseHeader />
        <div className="speakwise-content">
          <AIChat />
        </div>
      </div>
    </>
  );
}
