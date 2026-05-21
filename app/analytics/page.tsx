"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import AuthButton from "@/app/components/AuthButton";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type AnalyticsSummary = {
  vocabstream: {
    completedLessons: number;
    lowScoreLessons: number;
    averageAccuracy: number;
    byGenre: Record<string, number>;
    latestActivityAt: string | null;
  };
  vidmatch: {
    savedVideos: number;
    totalClicks: number;
    byLevel: Record<string, number>;
    latestActivityAt: string | null;
  };
  speakwise: {
    lessonSessions: number;
    totalMinutes: number;
    byMode: Record<string, number>;
    byLevel: Record<string, number>;
    latestActivityAt: string | null;
  };
};

const emptySummary: AnalyticsSummary = {
  vocabstream: {
    completedLessons: 0,
    lowScoreLessons: 0,
    averageAccuracy: 0,
    byGenre: {},
    latestActivityAt: null,
  },
  vidmatch: {
    savedVideos: 0,
    totalClicks: 0,
    byLevel: {},
    latestActivityAt: null,
  },
  speakwise: {
    lessonSessions: 0,
    totalMinutes: 0,
    byMode: {},
    byLevel: {},
    latestActivityAt: null,
  },
};

export default function AnalyticsPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [summary, setSummary] = useState<AnalyticsSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadAnalytics() {
      setLoading(true);
      setError("");

      try {
        if (!supabase) {
          setError("Supabase public environment variables are not configured.");
          return;
        }

        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;
        if (!accessToken) {
          setError("ログインすると学習分析を表示できます。");
          return;
        }

        const response = await fetch("/api/analytics/summary", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const payload = await response.json();

        if (!response.ok || payload.error) {
          throw new Error(payload.error || "Analytics request failed");
        }

        if (!cancelled) setSummary(payload);
      } catch (loadError) {
        console.error(loadError);
        if (!cancelled) setError("学習分析を読み込めませんでした。少し時間をおいて再試行してください。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAnalytics();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const totalStudyMinutes = Math.round(summary.speakwise.totalMinutes);
  const strongVocabLessons = Math.max(0, summary.vocabstream.completedLessons - summary.vocabstream.lowScoreLessons);

  return (
    <div className="analytics-shell">
      <style>{styles}</style>

      <header className="analytics-header">
        <div className="analytics-header-inner">
          <Link href="/" className="brand-link">
            <img src="/images/logo.png" alt="Project Fluence" />
            <span>Project Fluence</span>
          </Link>
          <div className="title-block">
            <span>学習ダッシュボード</span>
            <h1>Analytics</h1>
          </div>
          <div className="header-actions">
            <AuthButton compact variant="banner" userMenu />
          </div>
        </div>
      </header>

      <main className="analytics-main">
        <div className="top-actions">
          <button type="button" className="back-button" onClick={() => window.history.back()}>
            ← 戻る
          </button>
          <div className="quick-links">
            <Link href="/vocabstream">VocabStream</Link>
            <Link href="/vidmatch">VidMatch</Link>
            <Link href="/speakwise">SpeakWise</Link>
          </div>
        </div>

        <section className="hero-section">
          <h2>学習の現在地</h2>
          <p>
            VocabStream、VidMatch、SpeakWiseの記録をひとつにまとめて、次に何を伸ばすかを見やすくします。
          </p>
          {loading && <p className="status-text">学習分析を読み込んでいます...</p>}
          {error && <p className="error-text">{error}</p>}
        </section>

        <section className="metric-grid" aria-label="Learning overview">
          <MetricCard label="完了レッスン" value={summary.vocabstream.completedLessons} unit="lessons" />
          <MetricCard label="安定スコア" value={strongVocabLessons} unit="lessons" />
          <MetricCard label="保存動画" value={summary.vidmatch.savedVideos} unit="videos" />
          <MetricCard label="SpeakWise時間" value={formatMinutes(totalStudyMinutes)} unit="total" />
        </section>

        <section className="detail-grid">
          <AnalyticsPanel title="VocabStream">
            <StatLine label="完了したレッスン" value={`${summary.vocabstream.completedLessons}`} />
            <StatLine label="平均正答率" value={`${Math.round(summary.vocabstream.averageAccuracy)}%`} />
            <StatLine label="復習推奨（60%未満）" value={`${summary.vocabstream.lowScoreLessons}`} />
            <BarList values={summary.vocabstream.byGenre} emptyLabel="まだレッスン記録がありません。" />
            <LastActivity value={summary.vocabstream.latestActivityAt} />
          </AnalyticsPanel>

          <AnalyticsPanel title="VidMatch">
            <StatLine label="YouTubeで見た動画" value={`${summary.vidmatch.savedVideos}`} />
            <StatLine label="合計クリック" value={`${summary.vidmatch.totalClicks}`} />
            <BarList values={summary.vidmatch.byLevel} emptyLabel="まだ動画履歴がありません。" order={["A1", "A2", "B1", "B2", "C1", "C2", "Unknown"]} />
            <LastActivity value={summary.vidmatch.latestActivityAt} />
          </AnalyticsPanel>

          <AnalyticsPanel title="SpeakWise">
            <StatLine label="開始したレッスン" value={`${summary.speakwise.lessonSessions}`} />
            <StatLine label="合計レッスン時間" value={formatMinutes(totalStudyMinutes)} />
            <BarList values={summary.speakwise.byMode} emptyLabel="まだSpeakWise記録がありません。" order={["speaking", "writing"]} />
            <BarList values={summary.speakwise.byLevel} emptyLabel="" order={["A1", "A2", "B1", "B2", "C1", "C2", "Unknown"]} />
            <LastActivity value={summary.speakwise.latestActivityAt} />
          </AnalyticsPanel>
        </section>
      </main>
    </div>
  );
}

function MetricCard({ label, value, unit }: { label: string; value: React.ReactNode; unit: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{unit}</small>
    </article>
  );
}

function AnalyticsPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="analytics-panel">
      <h3>{title}</h3>
      {children}
    </article>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BarList({ values, emptyLabel, order }: { values: Record<string, number>; emptyLabel: string; order?: string[] }) {
  const entries = Object.entries(values);
  const sortedEntries = order
    ? order.filter((key) => values[key]).map((key) => [key, values[key]] as [string, number])
    : entries.sort((a, b) => b[1] - a[1]);
  const maxValue = sortedEntries.reduce((max, [, value]) => Math.max(max, value), 0);

  if (sortedEntries.length === 0) {
    return emptyLabel ? <p className="empty-note">{emptyLabel}</p> : null;
  }

  return (
    <div className="bar-list">
      {sortedEntries.map(([label, value]) => (
        <div key={label} className="bar-row">
          <div className="bar-label">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${maxValue ? (value / maxValue) * 100 : 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function LastActivity({ value }: { value: string | null }) {
  return (
    <p className="last-activity">
      最終記録: {value ? formatDate(value) : "まだありません"}
    </p>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "不明";
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}時間${remainingMinutes}分` : `${hours}時間`;
}

const styles = `
  .analytics-shell {
    min-height: 100vh;
    background: #e5e7eb;
    color: #10203b;
  }

  .analytics-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    background: linear-gradient(90deg, #4f46e5 0%, #06b6d4 100%);
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.22);
  }

  .analytics-header-inner {
    position: relative;
    max-width: 1280px;
    min-height: 64px;
    margin: 0 auto;
    padding: 6px 18px;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 14px;
  }

  .brand-link {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 38px;
    padding: 0 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.94);
    color: #0b1730;
    text-decoration: none;
    font-weight: 800;
  }

  .brand-link img {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    object-fit: cover;
  }

  .title-block {
    text-align: center;
    color: #ffffff;
  }

  .title-block span {
    display: block;
    font-size: 10px;
    letter-spacing: 0.18em;
    font-weight: 800;
  }

  .title-block h1 {
    margin: 2px 0 0;
    font-size: 26px;
    line-height: 1;
    font-weight: 900;
  }

  .header-actions {
    justify-self: end;
  }

  .analytics-main {
    width: 100%;
    max-width: 1180px;
    margin: 0 auto;
    padding: 104px 16px 72px;
  }

  .top-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 18px;
    flex-wrap: wrap;
  }

  .back-button,
  .quick-links a {
    min-height: 38px;
    border-radius: 999px;
    border: 1px solid #d1d5db;
    background: #ffffff;
    color: #173a71;
    padding: 0 14px;
    font-weight: 800;
    text-decoration: none;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
  }

  .quick-links {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .quick-links a {
    display: inline-flex;
    align-items: center;
  }

  .hero-section,
  .analytics-panel,
  .metric-card {
    background: #ffffff;
    border: 1px solid rgba(209, 213, 219, 0.82);
    border-radius: 16px;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  }

  .hero-section {
    padding: 24px;
  }

  .hero-section h2 {
    margin: 0 0 8px;
    color: #173a71;
    font-size: 28px;
    font-weight: 900;
  }

  .hero-section p {
    margin: 0;
    max-width: 760px;
    color: #475569;
    line-height: 1.75;
  }

  .status-text {
    margin-top: 12px !important;
    font-weight: 800;
    color: #173a71 !important;
  }

  .error-text {
    margin-top: 12px !important;
    font-weight: 800;
    color: #b42318 !important;
  }

  .metric-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
    margin-top: 18px;
  }

  .metric-card {
    min-height: 132px;
    padding: 18px;
    display: grid;
    align-content: center;
    gap: 8px;
  }

  .metric-card span {
    color: #475569;
    font-weight: 800;
  }

  .metric-card strong {
    color: #10203b;
    font-size: 32px;
    line-height: 1;
    font-weight: 900;
  }

  .metric-card small {
    color: #64748b;
    font-weight: 800;
  }

  .detail-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    margin-top: 18px;
  }

  .analytics-panel {
    padding: 18px;
    min-width: 0;
  }

  .analytics-panel h3 {
    margin: 0 0 14px;
    color: #173a71;
    font-size: 22px;
    font-weight: 900;
  }

  .stat-line {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid #e5e7eb;
    color: #475569;
    font-weight: 800;
  }

  .stat-line strong {
    color: #10203b;
  }

  .bar-list {
    display: grid;
    gap: 12px;
    margin-top: 16px;
  }

  .bar-label {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 6px;
    color: #334155;
    font-size: 13px;
    font-weight: 800;
  }

  .bar-track {
    height: 9px;
    overflow: hidden;
    border-radius: 999px;
    background: #e5e7eb;
  }

  .bar-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #4f46e5, #06b6d4);
  }

  .empty-note,
  .last-activity {
    color: #64748b;
    font-weight: 800;
    line-height: 1.6;
  }

  .last-activity {
    margin: 16px 0 0;
    font-size: 13px;
  }

  @media (max-width: 900px) {
    .metric-grid,
    .detail-grid {
      grid-template-columns: 1fr;
    }

    .analytics-header-inner {
      grid-template-columns: auto auto;
    }

    .title-block {
      display: none;
    }
  }

  @media (max-width: 560px) {
    .analytics-main {
      padding-left: 12px;
      padding-right: 12px;
    }

    .brand-link span {
      display: none;
    }
  }
`;
