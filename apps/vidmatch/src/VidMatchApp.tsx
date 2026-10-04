"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/app/components/AppHeader";
import AppBrand from "@/app/components/AppBrand";
import AuthButton from "@/app/components/AuthButton";
import { requestSignal } from "@/lib/browserRequest";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

import { parseVideoRows, parseVideoRecommendations, thumbnailSources, youtubeWatchUrl, type VidMatchVideo } from "./services/videoContract";
import { TOPICS, TOPIC_LABELS, normalizeTopics } from "./services/videoTaxonomy";

// Bound waits on mobile/network interruptions; never retry learner writes automatically.
async function browserFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const deadline = requestSignal(15_000, init.signal ? [init.signal] : []);
  try {
    const response = await fetch(input, { ...init, signal: deadline.signal, cache: "no-store" });
    // These bounded metadata responses are buffered so the deadline covers JSON delivery too.
    const body = await response.arrayBuffer();
    return new Response([204, 205, 304].includes(response.status) ? null : body, { status: response.status, statusText: response.statusText, headers: response.headers });
  } finally { deadline.dispose(); }
}

type HistoryVideo = VidMatchVideo & { last_clicked_at: string; created_at: string; click_count?: number };
type Settings = {
  selectedLevel: string;
  selectedSkills: string[];
  selectedTopics: string[];
  customTopics: string;
  selectedAccent: string;
  captionOnly: boolean;
};
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const LEVEL_LABELS = ["入門", "初級", "中級", "中上級", "上級", "熟練"];
const ACCENTS = ["American", "British", "Australian", "Canadian"];
const LABELS: Record<string, string> = {
  ...TOPIC_LABELS,
  American: "アメリカ英語", British: "イギリス英語", Australian: "オーストラリア英語", Canadian: "カナダ英語",
};
const DEFAULT_SETTINGS: Settings = {
  selectedLevel: "B1", selectedSkills: [], selectedTopics: [], customTopics: "", selectedAccent: "", captionOnly: false,
};
function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && !!item.trim()).map((item) => item.trim()) : [];
}
function sanitizeSettings(value: unknown): Settings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<Settings>;
  return {
    selectedLevel: typeof raw.selectedLevel === "string" && LEVELS.includes(raw.selectedLevel) ? raw.selectedLevel : "B1",
    selectedSkills: [],
    selectedTopics: normalizeTopics(stringArray(raw.selectedTopics)).filter((topic) => (TOPICS as readonly string[]).includes(topic)),
    customTopics: typeof raw.customTopics === "string" ? raw.customTopics.slice(0, 240) : "",
    selectedAccent: typeof raw.selectedAccent === "string" && ACCENTS.includes(raw.selectedAccent) ? raw.selectedAccent : "",
    captionOnly: Boolean(raw.captionOnly),
  };
}
function decodeId(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

export default function VidMatchApp({ pathname }: { pathname: string }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const settingsSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const recommendationRequest = useRef<AbortController | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsRestored, setSettingsRestored] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsStatus, setSettingsStatus] = useState("");
  const [settingsRetry, setSettingsRetry] = useState(0);
  const [settingsSaveRetry, setSettingsSaveRetry] = useState(0);
  const settingsDirty = useRef(false);
  const [recommendations, setRecommendations] = useState<VidMatchVideo[]>([]);
  const [recommendationError, setRecommendationError] = useState("");
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState("");
  const [moreNeedsRestart, setMoreNeedsRestart] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const searchedParams = useRef<URLSearchParams>(new URLSearchParams());
  const [hasSearched, setHasSearched] = useState(false);
  const [history, setHistory] = useState<HistoryVideo[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyRetry, setHistoryRetry] = useState(0);
  const [trackingError, setTrackingError] = useState("");
  const requestNumber = useRef(0);
  const resultsRef = useRef<HTMLElement>(null);
  const isHistory = pathname === "/history";
  const isSimilar = pathname.startsWith("/similar/");
  const similarId = isSimilar ? decodeId(pathname.slice("/similar/".length)) : "";
  const topics = useMemo(() => normalizeTopics([
    ...settings.selectedTopics, ...settings.customTopics.split(/[,、]/).map((topic) => topic.trim()).filter(Boolean),
  ]), [settings.selectedTopics, settings.customTopics]);
  const topicError = topics.length > 10 ? "トピックは10個以内で入力してください。" : topics.some((topic) => topic.length > 80) ? "各トピックは80文字以内で入力してください。" : "";

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const applySession = (token: string | null, id: string | null) => {
      if (!active) return;
      tokenRef.current = token;
      setAccessToken(token);
      setUserId(id);
      setAuthReady(true);
    };
    void supabase.auth.getSession().then(({ data }) => applySession(data.session?.access_token ?? null, data.session?.user.id ?? null)).catch(() => { if (active) setAuthReady(true); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => applySession(session?.access_token ?? null, session?.user.id ?? null));
    return () => { active = false; subscription.unsubscribe(); };
  }, [supabase]);

  useEffect(() => {
    settingsDirty.current = false;
    setSettingsRestored(false);
    setSettingsError("");
    setSettingsStatus("");
    setSettings(DEFAULT_SETTINGS);
    if (!userId || !tokenRef.current) { setSettingsLoading(false); return; }
    const controller = new AbortController();
    setSettingsLoading(true);
    void browserFetch("/api/vidmatch/settings", { headers: { Authorization: `Bearer ${tokenRef.current}` }, signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || data.error) throw new Error("Settings unavailable");
        if (controller.signal.aborted) return;
        const restored = sanitizeSettings(data.settings);
        if (restored) setSettings(restored);
        setSettingsRestored(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSettingsError("保存した条件を読み込めませんでした。検索はできますが、条件の自動保存は一時停止しています。");
      })
      .finally(() => { if (!controller.signal.aborted) setSettingsLoading(false); });
    return () => controller.abort();
  }, [userId, settingsRetry]);

  useEffect(() => {
    if (!accessToken || !settingsRestored || !settingsDirty.current || topicError) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setSettingsStatus("条件を保存中…");
      // Serialize in-flight saves so ordinary slow responses cannot reorder choices.
      settingsSaveQueue.current = settingsSaveQueue.current.catch(() => {}).then(async () => {
        if (!active) return;
        try {
          const response = await browserFetch("/api/vidmatch/settings", {
            method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ settings }),
          });
          if (!response.ok) throw new Error("Save failed");
          if (active) { settingsDirty.current = false; setSettingsError(""); setSettingsStatus("条件を保存しました"); }
        } catch {
          if (active) { setSettingsStatus(""); setSettingsError("条件を保存できませんでした。検索はそのまま続けられます。"); }
        }
      });
    }, 600);
    return () => { active = false; window.clearTimeout(timer); };
  }, [accessToken, settings, settingsRestored, settingsSaveRetry, topicError]);

  const updateSettings = (patch: Partial<Settings>) => {
    settingsDirty.current = true;
    setSettingsStatus("");
    setSettings((current) => ({ ...current, ...patch }));
  };
  const toggleTopic = (value: string) => {
    updateSettings({ selectedTopics: settings.selectedTopics.includes(value) ? settings.selectedTopics.filter((item) => item !== value) : [...settings.selectedTopics, value] });
  };

  const loadRecommendations = useCallback(async (params: URLSearchParams, scroll = false, append = false) => {
    const currentRequest = ++requestNumber.current;
    recommendationRequest.current?.abort();
    const controller = new AbortController();
    recommendationRequest.current = controller;
    setRecommendationLoading(!append);
    setMoreLoading(append);
    setMoreError("");
    setMoreNeedsRestart(false);
    if (!append) { searchedParams.current = new URLSearchParams(params); setNextCursor(null); }
    setRecommendationError("");
    setHasSearched(true);
    try {
      const response = await browserFetch(`/api/vidmatch/recommend?${params}`, { signal: controller.signal });
      const data = await response.json();
      if (append && response.status === 400 && data.code === "invalid_cursor") {
        if (currentRequest === requestNumber.current) {
          setMoreError("動画一覧が更新されました。最新の一覧を読み込んでください。");
          setMoreNeedsRestart(true);
        }
        return;
      }
      if (!response.ok || data.error) throw new Error("Recommendations unavailable");
      const page = parseVideoRecommendations(data);
      if (currentRequest === requestNumber.current) {
        setRecommendations((current) => append ? [...new Map([...current, ...page.videos].map((video) => [video.video_id, video])).values()] : page.videos);
        setNextCursor(page.nextCursor);
      }
    } catch {
      if (currentRequest === requestNumber.current) {
        if (append) setMoreError("続きの動画を読み込めませんでした。表示中の動画はそのまま見られます。");
        else { setRecommendations([]); setRecommendationError("動画を読み込めませんでした。通信状況を確認して、もう一度お試しください。"); }
      }
    } finally {
      if (currentRequest === requestNumber.current) {
        setRecommendationLoading(false);
        setMoreLoading(false);
        if (scroll && window.innerWidth < 900) window.requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
      }
    }
  }, []);

  const loadMore = () => {
    if (!nextCursor || moreLoading) return;
    const params = new URLSearchParams(searchedParams.current);
    params.set("cursor", nextCursor);
    void loadRecommendations(params, false, true);
  };

  const search = () => {
    if (topicError) return;
    const params = new URLSearchParams({ level: settings.selectedLevel, limit: "6" });
    topics.forEach((topic) => params.append("topics", topic));
    if (settings.selectedAccent) params.set("accent", settings.selectedAccent);
    if (settings.captionOnly) params.set("transcript_available", "true");
    void loadRecommendations(params, true);
  };
  const searchSimilar = useCallback(() => {
    if (similarId) void loadRecommendations(new URLSearchParams({ similar_to: similarId, limit: "6" }));
  }, [loadRecommendations, similarId]);
  const invalidateRequests = useCallback(() => { requestNumber.current += 1; recommendationRequest.current?.abort(); }, []);
  useEffect(() => {
    if (isSimilar) searchSimilar();
    else { invalidateRequests(); setRecommendations([]); setRecommendationLoading(false); setMoreLoading(false); setMoreError(""); setNextCursor(null); setRecommendationError(""); setHasSearched(false); }
    return invalidateRequests;
  }, [isSimilar, searchSimilar, invalidateRequests]);

  useEffect(() => {
    if (!isHistory || !authReady) return;
    setHistory([]);
    setHistoryError("");
    if (!accessToken) { setHistoryLoading(false); return; }
    const controller = new AbortController();
    setHistoryLoading(true);
    void browserFetch("/api/vidmatch/history", { headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || data.error) throw new Error("History unavailable");
        if (!controller.signal.aborted) setHistory(parseVideoRows(data.history) as HistoryVideo[]);
      }).catch(() => { if (!controller.signal.aborted) setHistoryError("動画の履歴を読み込めませんでした。もう一度お試しください。"); })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [accessToken, authReady, isHistory, historyRetry]);

  const recordVideoClick = async (video: VidMatchVideo) => {
    if (!accessToken) return;
    setTrackingError("");
    try {
      const response = await browserFetch("/api/vidmatch/history", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ video_id: video.video_id }), keepalive: true,
      });
      if (!response.ok) throw new Error("History save failed");
    } catch { setTrackingError("動画は開きましたが、履歴を保存できませんでした。"); }
  };
  const renderVideos = (videos: VidMatchVideo[]) => <div className="vm-video-grid">{videos.map((video) => <VideoCard key={video.video_id} video={video} onOpen={recordVideoClick} openedAt={"last_clicked_at" in video ? String(video.last_clicked_at) : undefined} />)}</div>;

  const results = <>
    {recommendationLoading ? <LoadingVideos /> : recommendationError ? (
      <div className="vm-state" role="alert"><h3>動画を読み込めませんでした</h3><p>{recommendationError}</p><button className="pf-button-secondary" onClick={isSimilar ? searchSimilar : search}>もう一度試す</button></div>
    ) : recommendations.length ? <><p className="vm-result-count" role="status">{recommendations.length}件の動画を表示中</p>{renderVideos(recommendations)}</> : (
      <div className={`vm-state${hasSearched ? "" : " vm-state-intro"}`} role="status">
        {hasSearched && <h3>条件に合う動画が見つかりませんでした</h3>}
        <p>{isSimilar ? "ほかの動画を選ぶか、条件を変えて探してみましょう。" : hasSearched ? "トピックやアクセントの指定を減らすと、見つかりやすくなります。" : "条件を選んで「動画を探す」を押してください。"}</p>
        {isSimilar && <Link href="/vidmatch" className="pf-button-secondary">条件を選んで探す</Link>}
        {!isSimilar && hasSearched && <button className="pf-button-secondary" onClick={() => { updateSettings({ selectedTopics: [], customTopics: "", selectedAccent: "", captionOnly: false }); }}>追加の条件をクリア</button>}
      </div>
    )}
    {!recommendationLoading && !recommendationError && nextCursor && <div className="vm-more">
      {moreError && <p className="vm-error" role="alert">{moreError}</p>}
      <button type="button" className="pf-button-secondary" onClick={moreNeedsRestart ? () => { void loadRecommendations(new URLSearchParams(searchedParams.current)); } : loadMore} disabled={moreLoading}>{moreLoading ? "続きの動画を読み込み中…" : moreNeedsRestart ? "動画一覧を更新" : moreError ? "続きをもう一度読み込む" : "もっと動画を見る"}</button>
    </div>}
  </>;

  return <div className="vm-shell">
    <style>{styles}</style>
    <AppHeader />
    <main id="main-content" className="pf-page vm-main">
      <div className="vm-page-heading">
        <AppBrand app="vidmatch" compact />
        <h1>{isHistory ? "動画の履歴" : isSimilar ? "似ている動画" : "英語の動画を探す"}</h1>
        {(isHistory || isSimilar) && <p>{isHistory ? "YouTubeで開いた動画の記録です。" : "レベルやテーマが近い動画です。"}</p>}
        <Link href={isHistory || isSimilar ? "/vidmatch" : "/vidmatch/history"} className="pf-button-secondary">{isHistory || isSimilar ? "動画を探す" : "動画の履歴"}<span aria-hidden="true"> →</span></Link>
      </div>
      <p className="vm-help vm-editorial-note">レベル・トピックはProjectFluenceによる学習の目安です。</p>
      {trackingError && <p className="vm-notice" role="status">{trackingError}</p>}
      {isHistory ? (
        <section className="vm-history" aria-label="動画の履歴">
          {history.length > 0 && <h2 className="sr-only">これまでに開いた動画</h2>}
          {!authReady || historyLoading ? <LoadingVideos /> : !accessToken ? <div className="vm-state pf-panel"><h2>気になる動画を、また見返そう</h2><p>ログインすると、YouTubeで開いた動画の履歴が残ります。</p><AuthButton /><Link href="/vidmatch" className="vm-text-link">ログインせずに動画を探す →</Link></div> : historyError ? <div className="vm-state pf-panel" role="alert"><h2>履歴を読み込めませんでした</h2><p>{historyError}</p><button className="pf-button-secondary" onClick={() => setHistoryRetry((value) => value + 1)}>もう一度試す</button></div> : history.length ? renderVideos(history) : <div className="vm-state pf-panel"><h2>最初の動画を見つけましょう</h2><p>動画の「YouTubeで見る」を押すと、ここに履歴が表示されます。</p><Link href="/vidmatch" className="pf-button">動画を探す</Link></div>}
        </section>
      ) : isSimilar ? (
        <section className="vm-results" ref={resultsRef} aria-label="似ている動画" aria-busy={recommendationLoading}>
          <Link href="/vidmatch/history" className="vm-text-link">← 動画の履歴に戻る</Link><h2 className="sr-only">似ている動画の検索結果</h2>{results}
        </section>
      ) : (
        <div className="vm-workspace">
          <form className="vm-preferences pf-panel" onSubmit={(event) => { event.preventDefault(); search(); }}>
            <fieldset disabled={!authReady || settingsLoading} className="vm-fieldset">
              <legend className="sr-only">動画の検索条件</legend>
              <div className="vm-control"><h2 id="vm-level-label">英語レベル</h2><div className="vm-levels" role="group" aria-labelledby="vm-level-label">{LEVELS.map((level, index) => <button key={level} type="button" className="vm-choice" aria-pressed={settings.selectedLevel === level} onClick={() => updateSettings({ selectedLevel: level })}><strong>{level}</strong><span>{LEVEL_LABELS[index]}</span></button>)}</div></div>
              <details className="vm-extra-filters"><summary>トピック・アクセントなど{(topics.length > 0 || settings.selectedAccent || settings.captionOnly) && <span className="vm-filter-dot" aria-label="追加条件を選択中" />}</summary>
                <div className="vm-control"><h3 id="vm-topic-label">好きなトピック</h3><div className="vm-chips" role="group" aria-labelledby="vm-topic-label">{TOPICS.map((topic) => <button key={topic} type="button" className="vm-choice" aria-pressed={settings.selectedTopics.includes(topic)} onClick={() => toggleTopic(topic)}>{LABELS[topic]}</button>)}</div><label className="vm-input-label" htmlFor="vm-custom-topics">その他のトピック</label><input id="vm-custom-topics" value={settings.customTopics} onChange={(event) => updateSettings({ customTopics: event.target.value })} maxLength={240} placeholder="例: music, cooking" aria-describedby={topicError ? "vm-topic-error vm-topic-hint" : "vm-topic-hint"} aria-invalid={!!topicError} /><p id="vm-topic-hint" className="vm-help">英語で入力し、複数ある場合はカンマで区切ってください。</p>{topicError && <p id="vm-topic-error" className="vm-error" role="alert">{topicError}</p>}</div>
                <div className="vm-control"><label className="vm-input-label" htmlFor="vm-accent">アクセント</label><select id="vm-accent" value={settings.selectedAccent} onChange={(event) => updateSettings({ selectedAccent: event.target.value })}><option value="">指定なし</option>{ACCENTS.map((accent) => <option key={accent} value={accent}>{LABELS[accent]}</option>)}</select></div>
                <label className="vm-caption"><input type="checkbox" checked={settings.captionOnly} onChange={(event) => updateSettings({ captionOnly: event.target.checked })} /><span>字幕のある動画のみ</span></label>
              </details>
              <button type="submit" className="pf-button vm-search" disabled={recommendationLoading || !!topicError}>{recommendationLoading ? "動画を検索中…" : "動画を探す"}<span aria-hidden="true"> →</span></button>
            </fieldset>
            <div className="vm-save-status" aria-live="polite">
              {!authReady || settingsLoading ? <p>保存した条件を読み込んでいます…</p> : settingsError ? <><p className="vm-error">{settingsError}</p>{settingsRestored ? <button type="button" className="vm-text-link" onClick={() => setSettingsSaveRetry((value) => value + 1)}>保存を再試行</button> : <button type="button" className="vm-text-link" onClick={() => setSettingsRetry((value) => value + 1)}>条件を再読み込み</button>}</> : <p>{accessToken ? settingsStatus || "検索条件は自動保存されます。" : "ログインすると条件と履歴を保存できます。"}</p>}
            </div>
          </form>
          <section className="vm-results" ref={resultsRef} aria-labelledby="vm-results-title" aria-busy={recommendationLoading}>
            <div className="vm-results-heading"><h2 id="vm-results-title">おすすめ動画</h2></div>
            {results}
          </section>
        </div>
      )}
    </main>
  </div>;
}

function VideoCard({ video, openedAt, onOpen }: { video: VidMatchVideo; openedAt?: string; onOpen: (video: VidMatchVideo) => Promise<void> }) {
  const duration = formatDuration(video.duration);
  const watchUrl = youtubeWatchUrl(video.video_id);
  const sources = useMemo(() => thumbnailSources(video.video_id, video.thumbnail_url), [video.video_id, video.thumbnail_url]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  useEffect(() => { setSourceIndex(0); setImageLoaded(false); }, [sources]);
  const thumbnail = sources[sourceIndex];
  const tags = Array.from(new Set([...(video.topics ?? []).slice(0, 2), ...(video.skills ?? [])])).slice(0, 3);
  return <article className="vm-video-card">
    <div className="vm-thumbnail" aria-busy={!!thumbnail && !imageLoaded}>
      {thumbnail ? <img src={thumbnail} alt="" width={480} height={360} loading="lazy" decoding="async" onLoad={() => setImageLoaded(true)} onError={() => {
        console.warn(JSON.stringify({ event: "vidmatch_media_failure", stage: "thumbnail", videoId: video.video_id, attempt: sourceIndex + 1 }));
        setImageLoaded(false); setSourceIndex((index) => index + 1);
      }} /> : <span className="vm-thumbnail-fallback">画像を読み込めませんでした<button type="button" className="vm-text-link" onClick={() => { setSourceIndex(0); setImageLoaded(false); }}>画像を再読み込み</button></span>}
      {duration && <span className="vm-duration">{duration}</span>}
    </div>
    <div className="vm-video-body"><p className="vm-channel">{video.channel_name}</p><h3>{video.title}</h3><div className="vm-tags">{video.level && <span className="vm-level-tag">{video.level_min && video.level_max && video.level_min !== video.level_max ? `${video.level_min}–${video.level_max}` : video.level}</span>}{tags.map((tag) => <span key={tag}>{LABELS[tag] || tag}</span>)}{video.transcript_available && <span>字幕あり</span>}</div>{video.description && <p className="vm-description">{video.description}</p>}{openedAt && <p className="vm-opened">前回開いた日: {formatDate(openedAt)}</p>}<div className="vm-video-actions"><a href={watchUrl ?? undefined} aria-disabled={!watchUrl} target="_blank" rel="noopener noreferrer" className="pf-button-secondary" onClick={(event) => { if (!watchUrl) { event.preventDefault(); return; } void onOpen(video); }} aria-label={`${video.title}をYouTubeで見る（新しいタブ）`}>YouTubeで見る <span aria-hidden="true">↗</span></a><Link href={`/vidmatch/similar/${encodeURIComponent(video.video_id)}`} className="vm-text-link" aria-label={`${video.title}に似た動画を探す`}>似た動画</Link></div></div>
  </article>;
}
function LoadingVideos() {
  return <div role="status" className="vm-loading"><p>動画を読み込んでいます…</p><div className="vm-video-grid" aria-hidden="true">{[0, 1, 2, 3].map((item) => <div className="vm-skeleton" key={item}><div /><span /><span /></div>)}</div></div>;
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(date);
}
function formatDuration(value: string | null) {
  if (!value) return "";
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return "";
  const hours = Number(match[1] || 0), minutes = Number(match[2] || 0), seconds = Number(match[3] || 0);
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const styles = `
.vm-shell { min-height:100vh; background:var(--pf-bg); color:var(--pf-text); }
.vm-main { padding-top:34px; padding-bottom:64px; }
.vm-page-heading { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:8px 20px; margin-bottom:24px; }
.vm-page-heading > .pf-app-brand { grid-column:1; grid-row:1; }
.vm-page-heading h1 { font-size:clamp(24px,3vw,32px); line-height:1.4; letter-spacing:-.035em; font-weight:750; margin:0; grid-column:1; }
.vm-page-heading p { grid-column:1; color:var(--pf-muted); line-height:1.6; margin:0; font-size:14px; }
.vm-page-heading > a { grid-column:2; grid-row:1 / span 3; }
.vm-workspace { display:grid; grid-template-columns:304px minmax(0,1fr); gap:28px; align-items:start; }
.vm-preferences { padding:22px; min-width:0; }
.vm-results-heading h2 { margin:0; font-size:18px; font-weight:700; }
.vm-fieldset { border:0; padding:0; margin:0; min-width:0; }
.vm-fieldset:disabled { opacity:.6; }
.vm-control { margin-top:22px; }
.vm-fieldset > .vm-control:first-of-type { margin-top:0; }
.vm-control h2, .vm-control h3 { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:0 0 10px; font-size:13px; font-weight:650; }
.vm-control h3 > span { font-size:11px; color:var(--pf-muted); font-weight:400; }
.vm-levels { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; }
.vm-choice { min-height:44px; border:1px solid var(--pf-border); background:var(--pf-surface); color:var(--pf-text); border-radius:9px; padding:8px 10px; font-size:13px; font-weight:500; line-height:1.4; transition:background .15s,border-color .15s; }
.vm-choice:hover { background:var(--pf-primary-soft); border-color:var(--pf-primary-border); }
.vm-choice[aria-pressed="true"] { border-color:var(--pf-primary); background:var(--pf-primary-soft); color:var(--pf-primary-hover); box-shadow:inset 0 0 0 1px var(--pf-primary); }
.vm-levels .vm-choice { display:grid; gap:3px; text-align:center; }
.vm-levels .vm-choice strong { font-size:15px; font-weight:700; }
.vm-levels .vm-choice span { font-size:10px; }
.vm-chips { display:flex; flex-wrap:wrap; gap:7px; }
.vm-extra-filters { border-top:1px solid var(--pf-border); border-bottom:1px solid var(--pf-border); margin-top:8px; padding:0; }
.vm-extra-filters summary { min-height:48px; padding:15px 0; font-size:13px; cursor:pointer; font-weight:600; }
.vm-extra-filters[open] { padding-bottom:14px; }
.vm-extra-filters[open] .vm-control:first-of-type { margin-top:4px; }
.vm-filter-dot { display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--pf-primary); margin-left:8px; }
.vm-input-label { display:block; font-size:13px; font-weight:600; margin:16px 0 7px; }
.vm-preferences input[type="text"], .vm-preferences input:not([type]), .vm-preferences select { width:100%; min-height:46px; padding:10px 11px; border:1px solid var(--pf-border); border-radius:8px; background:var(--pf-surface); color:var(--pf-text); font-size:16px; }
.vm-help { color:var(--pf-muted); font-size:11px; line-height:1.7; margin:7px 0 0; }
.vm-caption { display:flex; align-items:center; gap:10px; min-height:48px; font-size:12px; line-height:1.7; margin-top:14px; cursor:pointer; }
.vm-caption input { width:18px; height:18px; flex-shrink:0; accent-color:var(--pf-primary); }
.vm-search { width:100%; margin-top:18px; display:flex; justify-content:space-between; }
.vm-save-status { margin-top:12px; color:var(--pf-muted); font-size:11px; line-height:1.8; }
.vm-save-status p { margin:0; }
.vm-error { color:#b42318; font-size:12px; line-height:1.7; }
.vm-results { min-width:0; scroll-margin-top:calc(var(--pf-header-height) + 20px); }
.vm-results-heading { padding:2px 0 16px; border-bottom:1px solid var(--pf-border); }
.vm-result-count { color:var(--pf-muted); margin:18px 0; font-size:12px; }
.vm-more { margin-top:24px; text-align:center; }
.vm-editorial-note { margin-bottom:18px; }
.vm-video-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; }
.vm-history .vm-video-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
.vm-video-card { min-width:0; display:flex; flex-direction:column; overflow:hidden; border:1px solid var(--pf-border); border-radius:12px; background:var(--pf-surface); }
.vm-thumbnail { position:relative; aspect-ratio:16/9; background:var(--pf-primary-soft); display:grid; place-items:center; overflow:hidden; }
.vm-thumbnail > img { display:block; width:100%; height:100%; object-fit:cover; }
.vm-thumbnail > span:not(.vm-duration) { font-size:34px; color:var(--pf-accent); }
.vm-thumbnail > .vm-thumbnail-fallback { font-size:11px; padding:8px; text-align:center; }
.vm-thumbnail-fallback button { font-size:11px; display:block; margin:auto; }
.vm-duration { position:absolute; right:10px; bottom:9px; background:var(--pf-text); color:var(--pf-surface); border-radius:4px; padding:3px 6px; font-size:11px; font-weight:600; }
.vm-video-body { padding:16px; display:flex; flex-direction:column; gap:10px; flex:1; min-width:0; }
.vm-channel { margin:0; font-size:11px; color:var(--pf-muted); overflow-wrap:anywhere; }
.vm-video-body h3 { margin:0; font-size:15px; line-height:1.6; font-weight:650; overflow-wrap:anywhere; }
.vm-tags { display:flex; flex-wrap:wrap; gap:5px; }
.vm-tags span { padding:3px 7px; font-size:10px; line-height:1.6; color:var(--pf-muted); border-radius:5px; background:var(--pf-surface-subtle); overflow-wrap:anywhere; }
.vm-tags .vm-level-tag { color:var(--pf-primary); background:var(--pf-primary-soft); font-weight:700; }
.vm-description { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; overflow-wrap:anywhere; color:var(--pf-muted); font-size:12px; line-height:1.7; margin:0; }
.vm-opened { font-size:11px; color:var(--pf-muted); margin:0; }
.vm-video-actions { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; padding-top:5px; margin-top:auto; }
.vm-video-actions > a { font-size:12px; }
.vm-text-link { display:inline-flex; min-height:44px; align-items:center; color:var(--pf-primary); text-decoration:none; font-weight:600; font-size:13px; background:none; border:0; padding:4px 0; }
.vm-text-link:hover { text-decoration:underline; }
.vm-state { padding:52px 24px; text-align:center; display:flex; flex-direction:column; align-items:center; gap:14px; background:var(--pf-surface); border:1px solid var(--pf-border); border-radius:var(--pf-radius); margin-top:20px; }
.vm-state h2, .vm-state h3 { margin:0; font-size:18px; line-height:1.7; font-weight:650; }
.vm-state p { max-width:390px; color:var(--pf-muted); margin:0; font-size:13px; line-height:1.9; }
.vm-state.vm-state-intro { padding:16px 0; margin:0; border:0; background:transparent; text-align:left; align-items:flex-start; }
.vm-loading > p { font-size:13px; color:var(--pf-muted); margin:18px 0; }
.vm-skeleton { background:var(--pf-surface); border:1px solid var(--pf-border); border-radius:12px; overflow:hidden; padding-bottom:22px; }
.vm-skeleton div { aspect-ratio:16/9; background:var(--pf-primary-soft); }
.vm-skeleton span { display:block; height:12px; border-radius:3px; margin:18px 16px 0; background:var(--pf-border); }
.vm-skeleton span:last-child { width:60%; margin-top:10px; }
.vm-notice { border:1px solid #ead7af; background:#fffbeb; padding:12px 16px; border-radius:10px; font-size:13px; line-height:1.7; }
@media(min-width:1100px) { .vm-preferences { position:sticky; top:calc(var(--pf-header-height) + 24px); } }
@media(max-width:1000px) { .vm-workspace { grid-template-columns:280px minmax(0,1fr); gap:20px; } .vm-video-grid { grid-template-columns:1fr; } .vm-history .vm-video-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media(max-width:899px) {
  .vm-main { padding-top:16px; padding-bottom:32px; }
  .vm-page-heading { margin-bottom:16px; gap:6px 12px; }
  .vm-page-heading h1 { font-size:24px; line-height:1.3; }
  .vm-workspace { grid-template-columns:1fr; gap:18px; }
  .vm-preferences { padding:16px; }
  .vm-results-heading h2 { font-size:16px; }
  .vm-control { margin-top:14px; }
  .vm-control h2, .vm-control h3 { margin-bottom:8px; }
  .vm-levels { grid-template-columns:repeat(6,minmax(0,1fr)); gap:6px; }
  .vm-levels .vm-choice { padding:4px 8px; gap:1px; min-height:44px; }
  .vm-choice { min-width:44px; }
  .vm-chips { gap:6px; }
  .vm-extra-filters { margin-top:4px; }
  .vm-extra-filters summary { min-height:44px; padding:11px 0; }
  .vm-extra-filters[open] { padding-bottom:8px; }
  .vm-caption { min-height:44px; margin-top:8px; }
  .vm-input-label { margin-top:12px; }
  .vm-search { min-height:44px; margin-top:12px; }
  .vm-save-status { margin-top:8px; line-height:1.6; }
  .vm-results-heading { padding-bottom:8px; }
  .vm-result-count { margin:10px 0; }
  .vm-video-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
  .vm-state { padding:24px 16px; gap:10px; margin-top:12px; }
  .vm-state p { line-height:1.7; }
  .vm-loading > p { margin:10px 0; }
}
@media(max-width:599px) {
  .vm-page-heading h1 { grid-column:1 / -1; font-size:22px; }
  .vm-page-heading p { grid-column:1 / -1; font-size:12px; }
  .vm-page-heading > a { grid-row:1; min-height:44px; padding:8px 12px; font-size:12px; }
  .vm-preferences { padding:14px; }
  .vm-levels { grid-template-columns:repeat(3,minmax(0,1fr)); }
  .vm-video-grid, .vm-history .vm-video-grid { grid-template-columns:1fr; gap:12px; }
  .vm-video-card { display:grid; grid-template-columns:104px minmax(0,1fr); gap:8px 12px; padding:12px; }
  .vm-thumbnail { grid-column:1; grid-row:1 / span 2; align-self:start; border-radius:6px; }
  .vm-thumbnail > .vm-thumbnail-fallback { font-size:11px; padding:8px; text-align:center; }
.vm-thumbnail-fallback button { font-size:11px; display:block; margin:auto; }
.vm-duration { right:4px; bottom:4px; padding:1px 4px; font-size:10px; }
  .vm-video-body { display:contents; }
  .vm-channel { grid-column:2; grid-row:1; line-height:1.5; }
  .vm-video-body h3 { grid-column:2; grid-row:2; font-size:14px; line-height:1.5; }
  .vm-tags, .vm-description, .vm-opened, .vm-video-actions { grid-column:1 / -1; }
  .vm-video-actions { justify-content:space-between; padding-top:2px; gap:6px; }
  .vm-video-actions > a { font-size:12px; }
  .vm-state h2, .vm-state h3 { font-size:16px; }
}
@media(max-width:359px) { .vm-video-card { grid-template-columns:88px minmax(0,1fr); gap:8px 10px; } }
`;
