import { Link } from "../lib/router-compat";
export default function StillUnderDevelopment() {
  return <div className="vs-page"><div className="vs-state"><p className="pf-eyebrow">COMING SOON</p><h1>このレッスンは準備中です</h1><p>公開まで、単語・熟語のレベル別レッスンをお楽しみください。</p><Link className="pf-button" to="/learn">学べるレッスンを見る <span aria-hidden="true">→</span></Link></div></div>;
}
