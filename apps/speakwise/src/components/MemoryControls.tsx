import { useState } from "react";
import { jsonRequest, type LearningRequest } from "../lib/learning";

type Props = { request: LearningRequest; onChanged: () => void; onBeforeReset: () => Promise<void> };
export default function MemoryControls({ request, onChanged, onBeforeReset }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [goals, setGoals] = useState("");
  const [interests, setInterests] = useState("");
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [correctionStyle, setCorrectionStyle] = useState("balanced");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [deleteScope, setDeleteScope] = useState<"derived" | "all" | null>(null);
  async function inspect() {
    setOpen(true); setBusy(true); setMessage("");
    try {
      const result = await request<Record<string, unknown>>("/api/speakwise/learner-memory");
      setData(result);
      const container = (result.profile || {}) as Record<string, unknown>;
      const profile = (container.preferences || result.preferences || {}) as Record<string, unknown>;
      setMemoryEnabled(container.memory_enabled !== false);
      setCorrectionStyle(typeof profile.correctionStyle === "string" ? profile.correctionStyle : "balanced");
      setGoals(Array.isArray(profile.goals) ? profile.goals.join(", ") : "");
      setInterests(Array.isArray(profile.interests) ? profile.interests.join(", ") : "");
    } catch (error) { setMessage(error instanceof Error ? error.message : "学習履歴を読み込めませんでした。"); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setMessage("");
    try {
      const list = (value: string) => value.split(/[,、\n]/).map(x => x.trim()).filter(Boolean).slice(0, 10);
      await request("/api/speakwise/learner-memory", jsonRequest({ memoryEnabled, preferences: { goals: list(goals), interests: list(interests), correctionStyle } }, "PATCH"));
      setMessage("メモリーと添削の設定を保存しました。"); onChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存できませんでした。"); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!deleteScope) return;
    setBusy(true);
    try {
      await onBeforeReset();
      await request("/api/speakwise/learner-memory", jsonRequest({ scope: deleteScope }, "DELETE"));
      setDeleteScope(null); setData(null);
      if (deleteScope === "all") { setGoals(""); setInterests(""); setCorrectionStyle("balanced"); }
      setMessage("選択したSpeakWiseメモリーを削除しました。"); onChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : "削除できませんでした。"); }
    finally { setBusy(false); }
  }
  return <div className="sw-memory-controls">
    <button className="sw-text-link" onClick={() => open ? setOpen(false) : void inspect()} aria-expanded={open}>学習メモリーを確認・編集</button>
    {open && <div>
      <p className="sw-note">明示した目標・興味と、練習結果から得た学習メモリーを区別して保存します。</p>
      <label className="sw-label" htmlFor="sw-memory-goals">目標（カンマで区切る）</label>
      <input id="sw-memory-goals" className="sw-input" value={goals} maxLength={1000} onChange={e => setGoals(e.target.value)} />
      <label className="sw-label" htmlFor="sw-memory-interests">興味</label>
      <input id="sw-memory-interests" className="sw-input" value={interests} maxLength={1000} onChange={e => setInterests(e.target.value)} />
      <label className="sw-label" htmlFor="sw-correction-style">添削の詳しさ</label><select id="sw-correction-style" className="sw-select" value={correctionStyle} onChange={event => setCorrectionStyle(event.target.value)}><option value="gentle">大事なポイントだけ</option><option value="balanced">バランスよく</option><option value="detailed">詳しく</option></select>
      <label className="sw-toggle"><input type="checkbox" checked={memoryEnabled} onChange={event => setMemoryEnabled(event.target.checked)} /><span>過去の学習メモリーを次のレッスンに使う</span></label>
      <button className="sw-topic" disabled={busy} onClick={() => void save()}>メモリー設定を保存</button>
      <p className="sw-note">目標・興味は上の欄で訂正できます。個別の練習記録はこの画面で編集できません。誤った推定を消す場合は、影響する記録を確認してリセットしてください。</p>
      {data && <details className="sw-details"><summary>保存された根拠を見る</summary><pre className="sw-memory-evidence">{JSON.stringify(data, null, 2)}</pre></details>}
      <div className="sw-action-row"><button className="sw-text-link" disabled={busy} onClick={() => setDeleteScope("derived")}>SpeakWiseの会話・学習記録をリセット</button><button className="sw-text-link" disabled={busy} onClick={() => setDeleteScope("all")}>SpeakWiseの記録・教材をすべて削除</button></div>
      {deleteScope && <div className="sw-alert"><p>{deleteScope === "derived" ? "SpeakWiseの会話、練習イベント、振り返り、推定された苦手を削除し、現在のレッスンを中断します。目標・興味、PDF、保存した読む教材は残ります。" : "SpeakWiseの会話、練習イベント、振り返り、目標・興味に加えて、PDF、保存した読む教材、自分だけの単語を削除し、現在のレッスンを中断します。"} VocabStreamとVidMatchの元の学習記録は残りますが、リセット前の記録は新しい個別化から除外されます。取り消しはできません。</p><button className="sw-topic" disabled={busy} onClick={() => void remove()}>削除を実行</button><button className="sw-topic" onClick={() => setDeleteScope(null)}>キャンセル</button></div>}
      {busy && <p role="status" className="sw-note">処理しています…</p>}
      {message && <p role="status" className="sw-note">{message}</p>}
    </div>}
  </div>;
}
