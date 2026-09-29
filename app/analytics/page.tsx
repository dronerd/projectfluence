"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import AppHeader from "@/app/components/AppHeader";
import AuthButton from "@/app/components/AuthButton";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type AnalyticsSummary = {
  vocabstream: { completedLessons: number; lowScoreLessons: number; averageAccuracy: number; byGenre: Record<string, number>; latestActivityAt: string | null };
  vidmatch: { savedVideos: number; totalClicks: number; byLevel: Record<string, number>; latestActivityAt: string | null };
  speakwise: { lessonSessions: number; totalMinutes: number; byMode: Record<string, number>; byLevel: Record<string, number>; latestActivityAt: string | null };
};
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2", "Unknown"];
const LABELS: Record<string, string> = {
  speaking: "スピーキング", writing: "ライティング", Unknown: "その他",
  "word-beginner": "単語・初級", "word-intermediate": "単語・中級", "word-advanced": "単語・上級", "word-proficiency": "単語・熟達",
  "idioms-beginner": "熟語・初級", "idioms-intermediate": "熟語・中級", "idioms-advanced": "熟語・上級", "idioms-proficiency": "熟語・熟達",
};

export default function AnalyticsPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const applySession = (token: string | null) => {
      if (!active) return;
      setAccessToken(token);
      setAuthReady(true);
    };
    void supabase.auth.getSession().then(({ data }) => applySession(data.session?.access_token ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => applySession(session?.access_token ?? null));
    return () => { active = false; subscription.unsubscribe(); };
  }, [supabase]);

  useEffect(() => {
    setSummary(null);
    setError("");
    if (!accessToken) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    void fetch("/api/analytics/summary", { headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || payload.error) throw new Error("Records unavailable");
        if (!controller.signal.aborted) setSummary(payload);
      }).catch(() => {
        if (!controller.signal.aborted) setError("学習の記録を読み込めませんでした。通信状況を確認して、もう一度お試しください。");
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [accessToken, retry]);

  const hasActivity = summary && (summary.vocabstream.completedLessons > 0 || summary.vidmatch.savedVideos > 0 || summary.speakwise.lessonSessions > 0);
  const latestActivity = summary ? [summary.vocabstream.latestActivityAt, summary.vidmatch.latestActivityAt, summary.speakwise.latestActivityAt].filter((value): value is string => !!value).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] : undefined;

  return <div className="progress-shell">
    <style>{styles}</style>
    <AppHeader />
    <main id="main-content" className="pf-page progress-main">
      <div className="progress-heading"><div><p className="pf-eyebrow">YOUR LEARNING</p><h1>学習の記録</h1><p>少しずつ積み重ねた学びを、ここで振り返りましょう。</p></div>{latestActivity && <p className="progress-latest">最近の学習<br /><strong>{formatDate(latestActivity)}</strong></p>}</div>

      {!authReady || loading || (accessToken && !summary && !error) ? <div className="progress-loading" role="status"><p>学習の記録を読み込んでいます…</p><div className="progress-grid" aria-hidden="true">{[0, 1, 2].map((item) => <div className="pf-panel progress-skeleton" key={item}><span /><span /><span /></div>)}</div></div> : !accessToken ? (
        <section className="pf-panel progress-welcome"><span className="progress-mark" aria-hidden="true">↗</span><h2>あなたの学びを、ひとつの記録に。</h2><p>ログインすると、単語の正答率や動画の履歴、会話レッスンの記録をまとめて確認できます。</p><div className="progress-welcome-actions"><AuthButton /><Link href="/vocabstream" className="pf-button-secondary">まずは単語を学ぶ</Link></div><p className="progress-note">ログイン後に保存された学習が表示されます。</p></section>
      ) : error ? <section className="pf-panel progress-welcome" role="alert"><h2>記録を読み込めませんでした</h2><p>{error}</p><button className="pf-button" onClick={() => setRetry((value) => value + 1)}>もう一度試す</button></section> : summary && (
        <>
          <section className="progress-next" aria-labelledby="progress-next-title"><div><span className="pf-eyebrow">NEXT STEP</span><h2 id="progress-next-title">{!hasActivity ? "最初のレッスンから始めましょう。" : summary.vocabstream.lowScoreLessons ? "復習で、ことばを自分のものに。" : "今日も、自分のペースで。"}</h2><p>{!hasActivity ? "短い練習から始めれば、ここに学びの記録が増えていきます。" : summary.vocabstream.lowScoreLessons ? `復習におすすめの単語レッスンが${summary.vocabstream.lowScoreLessons}件あります。気になる単語をもう一度確かめましょう。` : "単語を覚える、英語を聞く、会話する。今の気分に合う練習を選びましょう。"}</p></div><Link href={summary.vocabstream.lowScoreLessons ? "/vocabstream/review" : "/vocabstream"} className="pf-button">{summary.vocabstream.lowScoreLessons ? "単語を復習する" : "単語を学ぶ"}<span aria-hidden="true">→</span></Link></section>

          <section className="progress-grid" aria-label="学習方法ごとの記録">
            <AnalyticsPanel eyebrow="VOCABULARY" title="単語を学ぶ" description="VocabStream" href="/vocabstream" action="単語の学習へ">
              <div className="progress-primary-stat"><strong>{summary.vocabstream.completedLessons}</strong><span>完了したレッスン</span></div>
              <dl className="progress-stat-list"><StatLine label="平均正答率" value={summary.vocabstream.completedLessons ? `${Math.round(summary.vocabstream.averageAccuracy)}%` : "—"} /><StatLine label="復習におすすめ" value={`${summary.vocabstream.lowScoreLessons} レッスン`} /></dl>
              <BarList title="学習したコース" values={summary.vocabstream.byGenre} emptyLabel="レッスンのクイズを終えると、正答率が表示されます。" />
              {summary.vocabstream.lowScoreLessons > 0 && <p className="progress-note">正答率60%未満のレッスンを復習の目安にしています。</p>}
              <LastActivity value={summary.vocabstream.latestActivityAt} />
            </AnalyticsPanel>
            <AnalyticsPanel eyebrow="LISTENING" title="動画で学ぶ" description="VidMatch" href={summary.vidmatch.savedVideos ? "/vidmatch/history" : "/vidmatch"} action={summary.vidmatch.savedVideos ? "動画の履歴へ" : "動画を探す"}>
              <div className="progress-primary-stat"><strong>{summary.vidmatch.savedVideos}</strong><span>YouTubeで開いた動画</span></div>
              <p className="progress-measure-note">動画を開いた記録です。視聴時間や視聴の完了は含みません。</p>
              <BarList title="動画のレベル" values={summary.vidmatch.byLevel} emptyLabel="気になる動画を開くと、ここに履歴がたまります。" order={LEVELS} />
              <LastActivity value={summary.vidmatch.latestActivityAt} />
            </AnalyticsPanel>
            <AnalyticsPanel eyebrow="CONVERSATION" title="会話を練習" description="SpeakWise" href="/speakwise" action="会話の練習へ">
              <div className="progress-primary-stat"><strong>{summary.speakwise.lessonSessions}</strong><span>開始したレッスン</span></div>
              <dl className="progress-stat-list"><StatLine label="レッスンの予定時間" value={formatMinutes(Math.round(summary.speakwise.totalMinutes))} /></dl>
              <p className="progress-measure-note">開始時に設定した時間の合計です。</p>
              <BarList title="練習したモード" values={summary.speakwise.byMode} emptyLabel="会話を始めると、練習の記録がここに表示されます。" order={["speaking", "writing"]} />
              {Object.keys(summary.speakwise.byLevel).length > 0 && <details className="progress-level-details"><summary>レベルごとの記録</summary><BarList title="" values={summary.speakwise.byLevel} emptyLabel="" order={LEVELS} /></details>}
              <LastActivity value={summary.speakwise.latestActivityAt} />
            </AnalyticsPanel>
          </section>
        </>
      )}
    </main>
  </div>;
}

function AnalyticsPanel({ eyebrow, title, description, href, action, children }: { eyebrow: string; title: string; description: string; href: string; action: string; children: React.ReactNode }) {
  return <article className="pf-panel progress-panel"><div className="progress-panel-heading"><p className="pf-eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p></div><div className="progress-panel-content">{children}</div><Link href={href} className="pf-button-secondary progress-panel-link">{action}<span aria-hidden="true">→</span></Link></article>;
}
function StatLine({ label, value }: { label: string; value: string }) {
  return <div className="progress-stat-line"><dt>{label}</dt><dd>{value}</dd></div>;
}
function BarList({ title, values, emptyLabel, order }: { title: string; values: Record<string, number>; emptyLabel: string; order?: string[] }) {
  const entries = Object.entries(values).filter(([, value]) => value > 0);
  const sorted = order ? [...entries].sort((a, b) => (order.includes(a[0]) ? order.indexOf(a[0]) : order.length) - (order.includes(b[0]) ? order.indexOf(b[0]) : order.length)) : entries.sort((a, b) => b[1] - a[1]);
  const max = Math.max(0, ...sorted.map(([, value]) => value));
  if (!sorted.length) return emptyLabel ? <p className="progress-empty-note">{emptyLabel}</p> : null;
  return <div className="progress-bars">{title && <h3>{title}</h3>}<ul>{sorted.map(([label, value]) => <li key={label}><div className="progress-bar-label"><span>{LABELS[label] || label}</span><strong>{value}</strong></div><div className="progress-bar-track" aria-hidden="true"><div style={{ width: `${value / max * 100}%` }} /></div></li>)}</ul></div>;
}
function LastActivity({ value }: { value: string | null }) {
  return value ? <p className="progress-last-activity">最近の記録: <time dateTime={value}>{formatDate(value)}</time></p> : null;
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(date);
}
function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes}分`;
  return `${Math.floor(minutes / 60)}時間${minutes % 60 ? `${minutes % 60}分` : ""}`;
}

const styles = `
.progress-shell { min-height:100vh; background:var(--pf-bg); color:var(--pf-text); }
.progress-heading { display:flex; align-items:center; justify-content:space-between; gap:24px; margin-bottom:30px; }
.progress-heading h1 { margin:7px 0 10px; font-size:32px; line-height:1.4; font-weight:750; letter-spacing:-.03em; }
.progress-heading p:not(.pf-eyebrow) { margin:0; color:var(--pf-muted); font-size:14px; line-height:1.8; }
.progress-latest { text-align:right; flex-shrink:0; font-size:12px !important; }
.progress-latest strong { color:var(--pf-text); font-weight:550; }
.progress-next { display:flex; align-items:center; justify-content:space-between; gap:24px; background:#eeedfa; border:1px solid #e0dcf4; border-radius:var(--pf-radius); padding:24px 28px; margin-bottom:28px; }
.progress-next h2 { margin:6px 0 7px; font-size:20px; font-weight:650; line-height:1.6; }
.progress-next p { margin:0; max-width:640px; color:var(--pf-muted); font-size:13px; line-height:1.8; }
.progress-next > a { flex-shrink:0; }
.progress-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px; align-items:stretch; }
.progress-panel { min-width:0; padding:24px; display:flex; flex-direction:column; }
.progress-panel-heading { padding-bottom:18px; border-bottom:1px solid var(--pf-border); }
.progress-panel-heading h2 { font-size:19px; font-weight:700; margin:7px 0 4px; }
.progress-panel-heading > p:last-child { color:var(--pf-muted); font-size:12px; margin:0; }
.progress-panel-content { display:flex; flex-direction:column; flex:1; }
.progress-primary-stat { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin:22px 0 14px; }
.progress-primary-stat strong { font-size:42px; line-height:1.2; font-weight:650; letter-spacing:-.06em; font-variant-numeric:tabular-nums; }
.progress-primary-stat > span { font-size:12px; color:var(--pf-muted); }
.progress-stat-list { margin:0; }
.progress-stat-line { display:flex; align-items:baseline; justify-content:space-between; gap:12px; font-size:12px; padding:10px 0; border-bottom:1px solid #edf0f5; }
.progress-stat-line dt { color:var(--pf-muted); }
.progress-stat-line dd { margin:0; font-size:14px; font-weight:650; text-align:right; }
.progress-measure-note { margin:0 0 5px; color:var(--pf-muted); font-size:11px; line-height:1.8; }
.progress-bars { margin-top:22px; }
.progress-bars h3 { margin:0 0 12px; font-size:12px; font-weight:600; }
.progress-bars ul { padding:0; margin:0; list-style:none; display:grid; gap:14px; }
.progress-bar-label { display:flex; justify-content:space-between; gap:12px; margin-bottom:7px; font-size:12px; }
.progress-bar-label span { color:var(--pf-muted); overflow-wrap:anywhere; }
.progress-bar-label strong { font-weight:600; }
.progress-bar-track { height:6px; background:#edf0f6; border-radius:4px; overflow:hidden; }
.progress-bar-track > div { height:100%; border-radius:inherit; background:#8d84d6; }
.progress-empty-note { margin:14px 0 22px; color:var(--pf-muted); font-size:13px; line-height:1.9; }
.progress-note { color:var(--pf-muted); font-size:11px; line-height:1.8; margin:15px 0 0; }
.progress-last-activity { font-size:11px; color:var(--pf-muted); padding-top:24px; margin-top:auto; margin-bottom:0; }
.progress-panel-link { margin-top:20px; justify-content:space-between; font-size:13px; }
.progress-level-details { margin-top:14px; }
.progress-level-details summary { font-size:12px; color:var(--pf-muted); padding:12px 0; min-height:44px; }
.progress-level-details .progress-bars { margin-top:4px; }
.progress-welcome { max-width:720px; margin:0 auto; padding:54px 36px; text-align:center; display:flex; flex-direction:column; align-items:center; gap:16px; }
.progress-welcome h2 { font-size:24px; line-height:1.6; font-weight:650; margin:0; letter-spacing:-.03em; }
.progress-welcome > p { margin:0; max-width:480px; color:var(--pf-muted); font-size:14px; line-height:1.9; }
.progress-welcome > p.progress-note { font-size:11px; }
.progress-mark { display:grid; place-items:center; width:56px; height:56px; border-radius:50%; color:var(--pf-primary); background:#eeedfc; font-size:25px; }
.progress-welcome-actions { display:flex; justify-content:center; flex-wrap:wrap; align-items:center; gap:12px; margin:8px 0; }
.progress-loading > p { color:var(--pf-muted); font-size:14px; margin-bottom:20px; }
.progress-skeleton { min-height:300px; padding:24px; }
.progress-skeleton span { display:block; height:18px; background:#e9edf5; border-radius:4px; margin-bottom:22px; }
.progress-skeleton span:nth-child(2) { height:70px; width:50%; }
@media(max-width:1100px) { .progress-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .progress-panel:last-child { grid-column:1 / -1; } }
@media(max-width:759px) { .progress-heading { align-items:flex-start; margin-bottom:24px; } .progress-heading h1 { font-size:28px; } .progress-latest { display:none; } .progress-next { padding:22px; align-items:flex-start; flex-direction:column; gap:18px; } .progress-next h2 { font-size:19px; } .progress-next > a { align-self:stretch; } .progress-grid { grid-template-columns:1fr; } .progress-panel:last-child { grid-column:auto; } .progress-panel { padding:22px; } .progress-welcome { padding:36px 24px; } .progress-welcome h2 { font-size:21px; } .progress-welcome-actions { flex-direction:column; width:100%; } .progress-welcome-actions > * { width:100%; } }
`;
