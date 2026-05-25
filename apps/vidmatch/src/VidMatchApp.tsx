"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import AuthButton from "@/app/components/AuthButton";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

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

type VidMatchHistoryItem = VidMatchVideo & {
  click_count?: number;
  last_clicked_at: string;
  created_at: string;
};

type VidMatchSettings = {
  selectedLevel: string;
  selectedSkills: string[];
  selectedTopics: string[];
  customTopics: string;
  selectedAccent: string;
  captionOnly: boolean;
};

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const SKILLS = ["listening", "vocabulary", "pronunciation", "grammar", "conversation"];
const TOPICS = ["travel", "daily life", "school"];
const ACCENTS = ["American", "British", "Australian", "Canadian"];
const DEFAULT_SETTINGS: VidMatchSettings = {
  selectedLevel: "B1",
  selectedSkills: ["listening"],
  selectedTopics: [],
  customTopics: "",
  selectedAccent: "",
  captionOnly: false,
};

const SKILL_LABELS: Record<string, string> = {
  listening: "リスニング",
  vocabulary: "語彙",
  pronunciation: "発音",
  grammar: "文法",
  conversation: "会話",
};

const TOPIC_LABELS: Record<string, string> = {
  travel: "旅行",
  "daily life": "日常生活",
  school: "学校・留学",
};

const ACCENT_LABELS: Record<string, string> = {
  American: "アメリカ英語",
  British: "イギリス英語",
  Australian: "オーストラリア英語",
  Canadian: "カナダ英語",
};

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function sanitizeSettings(value: unknown): VidMatchSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<VidMatchSettings>;
  const selectedLevel = typeof raw.selectedLevel === "string" && LEVELS.includes(raw.selectedLevel)
    ? raw.selectedLevel
    : DEFAULT_SETTINGS.selectedLevel;
  const selectedSkills = readStringArray(raw.selectedSkills).filter((skill) => SKILLS.includes(skill));
  const selectedTopics = readStringArray(raw.selectedTopics).filter((topic) => TOPICS.includes(topic));
  const selectedAccent = typeof raw.selectedAccent === "string" && ACCENTS.includes(raw.selectedAccent)
    ? raw.selectedAccent
    : "";

  return {
    selectedLevel,
    selectedSkills: selectedSkills.length ? selectedSkills : DEFAULT_SETTINGS.selectedSkills,
    selectedTopics,
    customTopics: typeof raw.customTopics === "string" ? raw.customTopics.slice(0, 240) : "",
    selectedAccent,
    captionOnly: Boolean(raw.captionOnly),
  };
}

export default function VidMatchApp({ pathname }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState(DEFAULT_SETTINGS.selectedLevel);
  const [selectedSkills, setSelectedSkills] = useState<string[]>(DEFAULT_SETTINGS.selectedSkills);
  const [selectedTopics, setSelectedTopics] = useState<string[]>(DEFAULT_SETTINGS.selectedTopics);
  const [customTopics, setCustomTopics] = useState(DEFAULT_SETTINGS.customTopics);
  const [selectedAccent, setSelectedAccent] = useState(DEFAULT_SETTINGS.selectedAccent);
  const [captionOnly, setCaptionOnly] = useState(DEFAULT_SETTINGS.captionOnly);
  const [recommendations, setRecommendations] = useState<VidMatchVideo[]>([]);
  const [recommendationError, setRecommendationError] = useState("");
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [history, setHistory] = useState<VidMatchHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const scrollToTop = useCallback(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const isHistoryRoute = pathname === "/history";
  const isNestedRoute = pathname !== "/" && !isHistoryRoute;

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

  const applySettings = useCallback((settings: VidMatchSettings) => {
    setSelectedLevel(settings.selectedLevel);
    setSelectedSkills(settings.selectedSkills);
    setSelectedTopics(settings.selectedTopics);
    setCustomTopics(settings.customTopics);
    setSelectedAccent(settings.selectedAccent);
    setCaptionOnly(settings.captionOnly);
  }, []);

  const currentSettings = useMemo<VidMatchSettings>(() => ({
    selectedLevel,
    selectedSkills,
    selectedTopics,
    customTopics,
    selectedAccent,
    captionOnly,
  }), [captionOnly, customTopics, selectedAccent, selectedLevel, selectedSkills, selectedTopics]);

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

  useEffect(() => {
    if (!supabase) {
      setSettingsLoaded(true);
      return;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const token = data.session?.access_token ?? null;
      setAccessToken(token);
      setSettingsLoaded(!token);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const token = session?.access_token ?? null;
      setAccessToken(token);
      setSettingsLoaded(!token);
      if (!token) {
        setSettingsLoading(false);
        setSettingsError("");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;
    setSettingsLoading(true);
    setSettingsLoaded(false);
    setSettingsError("");

    fetch("/api/vidmatch/settings", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || data.error) {
          throw new Error(data.error || "Settings request failed");
        }
        return sanitizeSettings(data.settings);
      })
      .then((storedSettings) => {
        if (!cancelled && storedSettings) applySettings(storedSettings);
      })
      .catch((error) => {
        console.warn("VidMatch settings load failed", error);
        if (!cancelled) setSettingsError("保存済みの条件を読み込めませんでした。");
      })
      .finally(() => {
        if (!cancelled) {
          setSettingsLoading(false);
          setSettingsLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, applySettings]);

  useEffect(() => {
    if (!settingsLoaded || !accessToken) return;

    const timer = window.setTimeout(() => {
      fetch("/api/vidmatch/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ settings: currentSettings }),
      })
        .then(async (response) => {
          if (!response.ok) {
            const data = await response.json().catch(() => null) as { error?: string } | null;
            throw new Error(data?.error || "Settings save failed");
          }
          setSettingsError("");
        })
        .catch((error) => {
          console.warn("VidMatch settings save failed", error);
          setSettingsError("条件を保存できませんでした。");
        });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [accessToken, currentSettings, settingsLoaded]);

  const getAccessToken = useCallback(async () => accessToken, [accessToken]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setHistory([]);
        setHistoryError("ログインすると動画の視聴履歴を確認できます。");
        return;
      }

      const response = await fetch("/api/vidmatch/history", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "History request failed");
      }

      setHistory(data.history ?? []);
    } catch (error) {
      console.error(error);
      setHistoryError("視聴履歴を取得できませんでした。少し時間をおいて再試行してください。");
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (isHistoryRoute) {
      fetchHistory();
    }
  }, [fetchHistory, isHistoryRoute]);

  const recordVideoClick = async (video: VidMatchVideo) => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      await fetch("/api/vidmatch/history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(video),
      });
    } catch (error) {
      console.warn("VidMatch history tracking failed", error);
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

        .header-menu-button {
          color: white;
          border: 0;
          background: transparent;
          cursor: pointer;
          font-size: 30px;
          line-height: 1;
          padding: 0;
        }

        .vidmatch-main {
          width: 100%;
          max-width: 1180px;
          margin: 0 auto;
          padding: 86px 18px 44px;
          box-sizing: border-box;
        }

        .vidmatch-workspace {
          display: grid;
          grid-template-columns: 340px minmax(0, 1fr);
          gap: 18px;
          align-items: start;
        }

        .vidmatch-panel,
        .vidmatch-section {
          background: #ffffff;
          border: 1px solid #d6e0ea;
          border-radius: 8px;
          box-shadow: 0 16px 38px rgba(22, 38, 60, 0.11);
        }

        .vidmatch-panel {
          padding: 18px;
          position: sticky;
          top: 86px;
        }

        .vidmatch-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
        }

        .vidmatch-logo-large {
          width: 44px;
          height: 44px;
          border-radius: 8px;
          object-fit: cover;
          flex: 0 0 auto;
        }

        .vidmatch-brand h2 {
          margin: 0;
          color: #12213a;
          font-size: 22px;
          line-height: 1;
          font-weight: 900;
        }

        .vidmatch-brand p {
          margin: 4px 0 0;
          color: #64748b;
          font-size: 13px;
          line-height: 1.35;
        }

        .vidmatch-section {
          padding: 18px;
        }

        .vidmatch-section h2 {
          margin: 0;
          color: #12213a;
          font-size: 21px;
          font-weight: 900;
        }

        .vidmatch-section-subtitle {
          margin: 5px 0 0;
          color: #64748b;
          font-size: 13px;
          line-height: 1.5;
        }

        .vidmatch-control-section {
          border-top: 1px solid #e2e8f0;
          padding-top: 14px;
          margin-top: 14px;
        }

        .settings-status {
          margin: 12px 0 0;
          color: #475569;
          font-size: 12px;
          font-weight: 750;
          line-height: 1.5;
        }

        .settings-status.is-error {
          color: #b42318;
        }

        .preference-label {
          display: block;
          color: #475569;
          font-size: 12px;
          font-weight: 800;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .chip-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .chip-row.levels {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .choice-chip,
        .recommend-button,
        .history-button,
        .youtube-link {
          border: 1px solid #d1d5db;
          border-radius: 8px;
          min-height: 38px;
          padding: 8px 10px;
          font-weight: 750;
          cursor: pointer;
          box-shadow: none;
          transition: transform 140ms cubic-bezier(0.2, 0.9, 0.2, 1), box-shadow 140ms ease,
            border-color 140ms ease, background 140ms ease, color 140ms ease;
        }

        .choice-chip {
          background: #ffffff;
          color: #162033;
        }

        .choice-chip:hover,
        .choice-chip:focus {
          transform: translateY(-1px);
          border-color: #b8c4d6;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
          outline: none;
        }

        .choice-chip.is-selected {
          background: #195a8a;
          border-color: #195a8a;
          box-shadow: none;
          color: #ffffff;
        }

        .choice-chip.is-selected:hover,
        .choice-chip.is-selected:focus {
          border-color: transparent;
          box-shadow: 0 8px 18px rgba(25, 90, 138, 0.18);
        }

        .caption-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          width: 100%;
          color: #334155;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }

        .caption-toggle input {
          width: 18px;
          height: 18px;
          accent-color: #195a8a;
        }

        .custom-topic-input {
          width: 100%;
          min-height: 40px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 0 10px;
          color: #10203b;
          background: #ffffff;
          font: inherit;
          font-size: 14px;
          box-sizing: border-box;
          margin-top: 8px;
        }

        .custom-topic-input:focus {
          border-color: #195a8a;
          box-shadow: 0 0 0 3px rgba(25, 90, 138, 0.14);
          outline: none;
        }

        .recommend-actions {
          display: grid;
          gap: 8px;
        }

        .recommend-button {
          width: 100%;
          background: #1b7f79;
          border-color: #1b7f79;
          box-shadow: none;
          color: #ffffff;
        }

        .history-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 38px;
          background: #ffffff;
          color: #195a8a;
          text-decoration: none;
        }

        .recommend-button:hover,
        .recommend-button:focus,
        .history-button:hover,
        .history-button:focus,
        .youtube-link:hover,
        .youtube-link:focus {
          transform: translateY(-1px);
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
          outline: none;
        }

        .recommend-button:disabled {
          cursor: wait;
          opacity: 0.72;
          transform: none;
          box-shadow: none;
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
          border: 1px solid #d6e0ea;
          border-radius: 8px;
          background: #ffffff;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
        }

        .history-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }

        .history-date {
          color: #64748b;
          font-size: 14px;
          font-weight: 800;
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
          padding: 14px;
        }

        .recommendation-title {
          margin: 0;
          color: #10203b;
          font-size: 16px;
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
          background: #edf4f8;
          color: #195a8a;
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
          background: #195a8a;
          border-color: #195a8a;
          box-shadow: none;
          color: #ffffff;
          text-decoration: none;
        }

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
            padding-top: 86px;
          }

          .vidmatch-workspace {
            grid-template-columns: 1fr;
          }

          .vidmatch-panel {
            position: static;
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

          .vidmatch-main {
            padding-left: 8px;
            padding-right: 8px;
          }

          .chip-row {
            grid-template-columns: 1fr;
          }

          .chip-row.levels {
            grid-template-columns: repeat(3, minmax(0, 1fr));
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

      <main className="vidmatch-main">
        {isHistoryRoute ? (
          <section className="vidmatch-section" aria-labelledby="vidmatch-history-title">
            <div className="history-header">
              <h2 id="vidmatch-history-title">動画の視聴履歴</h2>
              <Link href="/vidmatch" className="history-button">
                動画を探す
              </Link>
            </div>

            {historyError && <p className="recommend-error">{historyError}</p>}
            {historyLoading && <p className="empty-recommendations">視聴履歴を読み込んでいます...</p>}

            {!historyLoading && history.length > 0 && (
              <div className="recommendation-grid" aria-live="polite">
                {history.map((video) => (
                  <article key={video.video_id} className="recommendation-card">
                    {video.thumbnail_url && (
                      <img src={video.thumbnail_url} alt="" className="recommendation-thumb" loading="lazy" />
                    )}
                    <div className="recommendation-body">
                      <h3 className="recommendation-title">{video.title}</h3>
                      <p className="recommendation-meta">
                        {video.channel_name} / {video.level || "level未設定"} / score{" "}
                        {Math.round(Number(video.quality_score))}
                      </p>
                      <p className="history-date">
                        最終クリック: {formatDateTime(video.last_clicked_at)}
                      </p>
                      <div className="recommendation-tags">
                        {[...(video.skills ?? []), ...(video.topics ?? [])].slice(0, 6).map((tag) => (
                          <span key={`${video.video_id}-${tag}`} className="recommendation-tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <a
                        className="youtube-link"
                        href={video.youtube_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => void recordVideoClick(video)}
                      >
                        YouTubeで見る
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {!historyLoading && !historyError && history.length === 0 && (
              <p className="empty-recommendations">
                まだ視聴履歴がありません。おすすめ動画から「YouTubeで見る」を押すとここに表示されます。
              </p>
            )}
          </section>
        ) : (
          <div className="vidmatch-workspace">
            <aside className="vidmatch-panel" aria-label="動画検索条件">
              <div className="vidmatch-brand">
                <Image
                  src="/images/videofinder.png"
                  alt=""
                  width={44}
                  height={44}
                  className="vidmatch-logo-large"
                />
                <div>
                  <h2>VidMatch</h2>
                  <p>今の英語レベルに合う動画を探す</p>
                </div>
              </div>
              {settingsLoading && (
                <p className="settings-status" aria-live="polite">保存済みの条件を読み込み中...</p>
              )}
              {!settingsLoading && settingsError && (
                <p className="settings-status is-error" aria-live="polite">{settingsError}</p>
              )}
              {!settingsLoading && !settingsError && !accessToken && (
                <p className="settings-status">ログインすると検索条件が自動保存されます。</p>
              )}

              <div className="vidmatch-control-section">
                <span className="preference-label">英語レベル</span>
                <div className="chip-row levels" role="group" aria-label="英語レベルを選択">
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

              <div className="vidmatch-control-section">
                <span className="preference-label">伸ばしたいスキル</span>
                <div className="chip-row" role="group" aria-label="伸ばしたいスキルを選択">
                  {SKILLS.map((skill) => (
                    <button
                      key={skill}
                      type="button"
                      className={`choice-chip ${selectedSkills.includes(skill) ? "is-selected" : ""}`}
                      onClick={() => toggleValue(skill, selectedSkills, setSelectedSkills)}
                    >
                      {SKILL_LABELS[skill] || skill}
                    </button>
                  ))}
                </div>
              </div>

              <div className="vidmatch-control-section">
                <span className="preference-label">トピック</span>
                <div className="chip-row" role="group" aria-label="トピックを選択">
                  {TOPICS.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      className={`choice-chip ${selectedTopics.includes(topic) ? "is-selected" : ""}`}
                      onClick={() => toggleValue(topic, selectedTopics, setSelectedTopics)}
                    >
                      {TOPIC_LABELS[topic] || topic}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  className="custom-topic-input"
                  value={customTopics}
                  onChange={(event) => setCustomTopics(event.target.value)}
                  placeholder="その他のトピックを入力"
                  aria-label="その他のトピック"
                />
              </div>

              <div className="vidmatch-control-section">
                <span className="preference-label">アクセント</span>
                <div className="chip-row" role="group" aria-label="アクセントを選択">
                  <button
                    type="button"
                    className={`choice-chip ${selectedAccent === "" ? "is-selected" : ""}`}
                    onClick={() => setSelectedAccent("")}
                  >
                    指定なし
                  </button>
                  {ACCENTS.map((accent) => (
                    <button
                      key={accent}
                      type="button"
                      className={`choice-chip ${selectedAccent === accent ? "is-selected" : ""}`}
                      onClick={() => setSelectedAccent(accent)}
                    >
                      {ACCENT_LABELS[accent] || accent}
                    </button>
                  ))}
                </div>
              </div>

              <div className="vidmatch-control-section">
                <label className="caption-toggle">
                  <span>字幕・文字起こしあり</span>
                  <input
                    type="checkbox"
                    checked={captionOnly}
                    onChange={(event) => setCaptionOnly(event.target.checked)}
                  />
                </label>
              </div>

              <div className="vidmatch-control-section">
                <div className="recommend-actions">
                  <button
                    type="button"
                    className="recommend-button"
                    onClick={fetchRecommendations}
                    disabled={recommendationLoading}
                  >
                    {recommendationLoading ? "検索中..." : "おすすめ動画を表示"}
                  </button>
                  <Link href="/vidmatch/history" className="history-button">
                    視聴履歴を見る
                  </Link>
                </div>
                {recommendationError && <p className="recommend-error" style={{ marginTop: 10 }}>{recommendationError}</p>}
              </div>
            </aside>

            <section className="vidmatch-section" aria-labelledby="vidmatch-recommend-title">
              <div className="history-header">
                <div>
                  <h2 id="vidmatch-recommend-title">おすすめ動画</h2>
                  <p className="vidmatch-section-subtitle">
                    レベル、スキル、トピックに合わせて英語インプット用のYouTube動画を表示します。
                  </p>
                </div>
                {isNestedRoute && (
                  <p className="vidmatch-notice">
                    このページは現在ホームに集約されています。
                  </p>
                )}
              </div>

              {recommendations.length > 0 ? (
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
                              {SKILL_LABELS[tag] || TOPIC_LABELS[tag] || tag}
                            </span>
                          ))}
                        </div>
                        {video.description && (
                          <p className="recommendation-description">
                            {video.description.length > 150 ? `${video.description.slice(0, 150)}...` : video.description}
                          </p>
                        )}
                        <a
                          className="youtube-link"
                          href={video.youtube_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => void recordVideoClick(video)}
                        >
                          YouTubeで見る
                        </a>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="empty-recommendations" style={{ marginTop: 16 }}>
                  左の条件を選んで「おすすめ動画を表示」を押してください。
                </p>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
