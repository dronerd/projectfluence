import React, { useState } from "react";
import AuthButton from "@/app/components/AuthButton";
import { Link } from "react-router-dom";

type HeaderProps = {
  title?: string;
  currentPath?: string;
  isLoginPage: boolean;
};

export default function Header({ title, isLoginPage }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const scrollToTop = () => {
    const opts: ScrollToOptions = { top: 0, behavior: "smooth" };
    try {
      if (typeof window !== "undefined" && window.scrollTo) window.scrollTo(opts);
      if (document?.documentElement?.scrollTo) document.documentElement.scrollTo(opts);
      if (document?.body?.scrollTo) document.body.scrollTo(opts);
    } catch {
      if (document?.documentElement) document.documentElement.scrollTop = 0;
      if (document?.body) document.body.scrollTop = 0;
    }
  };

  const handleKeyToScroll = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      scrollToTop();
    }
  };

  return (
    <>
      <style>{`
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
          overflow: visible;
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

        .header-subtitle {
          font-size: 12px;
          color: #aebed5;
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

        .header-icon-btn {
          border: none;
          cursor: pointer;
        }

        .header-menu-button {
          color: white;
          border: 0;
          background: transparent;
          cursor: pointer;
          font-size: 30px;
          line-height: 1;
          padding: 0;
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

          .header-subtitle {
            display: none;
          }
        }

        .hide-global-navs .app-header {
          display: none !important;
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
            <Link to="/learn" className="vocab-title-link" onClick={scrollToTop}>
              <span className="vocab-overline">単語学習アプリ</span>
              <h1 className="vocab-title">{title ?? "VocabStream"}</h1>
            </Link>
          </div>

          <div className="header-right">
            {!isLoginPage && (
              <>
                <div className="hidden sm:flex items-center gap-2">
                  <AuthButton compact variant="banner" userMenu />
                  <AuthButton compact variant="banner" initialMode="sign-up" />
                </div>
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  className="header-menu-button"
                  aria-label="Open menu"
                >
                  ☰
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40" style={{ zIndex: 1100 }}>
          <div className="absolute right-0 top-0 h-full w-64 overflow-y-auto bg-white p-6 shadow-lg">
            <button onClick={() => setMenuOpen(false)} className="text-xl mb-6" aria-label="Close menu">
              ✕
            </button>

            <nav className="flex flex-col gap-4 text-lg text-gray-950">
              <div className="border-b border-gray-200 pb-4 sm:hidden">
                <div className="flex flex-col gap-3">
                  <AuthButton userMenu inlineUserMenu authenticatedOnly />
                  <AuthButton hideWhenAuthenticated />
                  <AuthButton initialMode="sign-up" />
                </div>
              </div>

              <div>
                <a href="/#apps" onClick={() => setMenuOpen(false)}>
                  英語学習アプリ
                </a>
                <div className="flex flex-col gap-2 mt-2 ml-4 text-base text-gray-600">
                  <a href="/vocabstream" onClick={() => setMenuOpen(false)}>
                    ・VocabStream
                  </a>
                  <a href="/vidmatch" onClick={() => setMenuOpen(false)}>
                    ・VidMatch
                  </a>
                  <a href="/speakwise" onClick={() => setMenuOpen(false)}>
                    ・SpeakWiseAI
                  </a>
                </div>
              </div>

              <a href="/#notes" onClick={() => setMenuOpen(false)}>
                最近のnote記事
              </a>
              <a href="/#english-motivation" onClick={() => setMenuOpen(false)}>
                英語を学ぶモチベーション
              </a>
              <a href="/#method" onClick={() => setMenuOpen(false)}>
                効果的な英語学習方法
              </a>
              <a href="/#prompts" onClick={() => setMenuOpen(false)}>
                AIプロンプト集
              </a>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
