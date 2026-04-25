import React from "react";
import { useAuth } from "../AuthContext";
import { Link, useNavigate } from "react-router-dom";

type HeaderProps = {
  title?: string;
  currentPath?: string;
  isLoginPage: boolean;
};

export default function Header({ title, isLoginPage }: HeaderProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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

  const handleLogoutAndGotoLanding = async () => {
    try {
      await logout?.();
    } catch (err) {
      console.error("logout error:", err);
    } finally {
      navigate("/learn");
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
          padding: 8px 18px;
          border-bottom: 1px solid rgba(158, 180, 210, 0.16);
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 14px;
          min-height: 56px;
          width: 100%;
          box-sizing: border-box;
          overflow-x: hidden;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.22);
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

        .header-subtitle {
          font-size: 12px;
          color: #aebed5;
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

        .header-icon-btn {
          border: none;
          cursor: pointer;
        }

        @media (max-width: 820px) {
          .app-header {
            grid-template-columns: auto 1fr;
            padding: 12px 14px;
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
        }

        @media (max-width: 560px) {
          .app-header {
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

          .header-subtitle {
            display: none;
          }
        }

        .hide-global-navs .app-header {
          display: none !important;
        }
      `}</style>

      <header className="app-header" role="banner">
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
          <Link to="/learn" className="header-pill vocab-pill" onClick={scrollToTop} aria-label="VocabStream learn page">
            <img src="/images/vocabstream.png" alt="VocabStream logo" />
            <span>Home</span>
          </Link>
          {user && !isLoginPage && (
            <button className="header-icon-btn" onClick={handleLogoutAndGotoLanding}>
              <span>ログアウト</span>
            </button>
          )}
        </div>
      </header>
    </>
  );
}
