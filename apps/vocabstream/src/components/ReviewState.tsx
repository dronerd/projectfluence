import AuthButton from "@/app/components/AuthButton";
import { Link } from "../lib/router-compat";

export default function ReviewState({ loading, signedIn, error, empty, onRetry }: { loading: boolean; signedIn: boolean; error: boolean; empty: boolean; onRetry: () => void }) {
  if (loading) return <div className="vs-state" role="status"><h2>復習の準備をしています</h2><p>学習記録を読み込んでいます…</p></div>;
  if (!signedIn) return <div className="vs-state"><h2>自分に合った復習を始めましょう</h2><p>ログインすると、レッスンで間違えた単語を保存し、まとめて復習できます。</p><div className="vs-actions"><AuthButton /><Link to="/learn" className="pf-button-secondary">レッスンを試す</Link></div></div>;
  if (error) return <div className="vs-state" role="alert"><h2>学習記録を読み込めませんでした</h2><p>通信状況を確認して、もう一度お試しください。</p><div className="vs-actions"><button className="pf-button" onClick={onRetry}>もう一度読み込む</button><Link to="/learn" className="pf-button-secondary">レッスン一覧へ</Link></div></div>;
  if (empty) return <div className="vs-state"><h2>次のレッスンから始めましょう</h2><p>まだ復習する単語はありません。レッスンで間違えた単語が、ここに集まります。</p><Link className="pf-button" to="/learn">レッスンを選ぶ <span aria-hidden="true">→</span></Link></div>;
  return null;
}
