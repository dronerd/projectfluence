import { useState } from "react";
import { languageTag } from "../lib/learning";

/** TTS accepts at most 4096 characters; expose segments rather than silently cutting text. */
export function speechSegments(text: string, limit = 3800): string[] {
  const parts: string[] = [];
  let remaining = text.trim();
  while (remaining.length > limit) {
    const sentence = Math.max(remaining.lastIndexOf(". ", limit), remaining.lastIndexOf("。", limit), remaining.lastIndexOf("\n", limit));
    const cut = sentence > limit / 2 ? sentence + 1 : limit;
    parts.push(remaining.slice(0, cut).trim()); remaining = remaining.slice(cut).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}
export function PassageAudio({ text, onListen, onStop, loading }: { text: string; onListen: (text: string) => void; onStop: () => void; loading: boolean }) {
  const parts = speechSegments(text);
  const [part, setPart] = useState(0);
  const selected = Math.min(part, Math.max(0, parts.length - 1));
  return <div className="sw-action-row">
    {parts.length > 1 && <label className="sw-audio-part">読み上げる部分<select className="sw-select" value={selected} onChange={event => setPart(Number(event.target.value))}>{parts.map((_, index) => <option value={index} key={index}>{index + 1} / {parts.length}</option>)}</select></label>}
    <button className="sw-topic" disabled={loading || !parts.length} onClick={() => onListen(parts[selected])}>{loading ? "音声を準備中…" : parts.length > 1 ? "この部分を聞く" : "教材を聞く"}</button>
    <button className="sw-topic" onClick={onStop}>音声を停止</button>
  </div>;
}
export default function SourcePassage({ text, language, onPractice }: { text: string; language: string; onPractice: (word: string) => void }) {
  const [selected, setSelected] = useState("");
  const inspectSelection = () => setSelected(window.getSelection()?.toString().trim().slice(0, 120) || "");
  return <>
    <div className="sw-source-text" lang={languageTag(language)} onMouseUp={inspectSelection} onTouchEnd={inspectSelection} onKeyUp={inspectSelection}>{text}</div>
    {selected && <button className="sw-topic" onClick={() => onPractice(selected)}>選択した語を練習: {selected}</button>}
  </>;
}
