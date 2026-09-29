import Link from "next/link";
import AppBrand from "./components/AppBrand";
import { learningApps } from "./lib/brands";
import AppHeader from "./components/AppHeader";
import LearningResources from "./components/LearningResources";
import "./home.css";

const practices = [
  { app: "vocabstream" as const, label: "単語を学ぶ", text: "英語の定義と例文で学び、クイズで確認。", action: "単語のレッスンへ", number: "01" },
  { app: "speakwise" as const, label: "会話を練習する", text: "AIとの会話・ライティング練習とフィードバック。", action: "会話の練習へ", number: "02" },
  { app: "vidmatch" as const, label: "動画で英語に触れる", text: "レベルや興味に合う英語の動画を探す。", action: "動画を探す", number: "03" },
];
export default function HomePage() {
  return <>
    <AppHeader />
    <main id="main-content" tabIndex={-1} className="pf-page home-page">
      <section className="home-intro" aria-labelledby="home-title">
        <div>
          <h1 id="home-title">今日の一歩を、<br className="home-mobile-break" />英語の自信に。</h1>
          <p className="home-intro-copy">単語・会話・動画から、練習を選びましょう。</p>
          <div className="home-intro-actions"><Link className="pf-button" href="/vocabstream">学習を始める <span aria-hidden="true">→</span></Link><Link className="home-text-link" href="/analytics">学習の記録を見る <span aria-hidden="true">↗</span></Link></div>
        </div>
        <aside className="home-start-note">
          <h2>はじめての方へ</h2>
          <p>登録せずに練習できます。ログインすると学習の記録を保存できます。</p>
        </aside>
      </section>
      <section id="apps" aria-labelledby="practice-title" className="home-practice">
        <div className="home-section-heading"><h2 id="practice-title">今日は何を練習しますか？</h2></div>
        <div className="home-practice-grid">{practices.map((practice) => <article className="home-practice-card pf-panel" key={practice.app}>
          <div className="home-card-top"><AppBrand app={practice.app} /><span className="home-card-number">{practice.number}</span></div>
          <h3>{practice.label}</h3><p className="home-card-copy">{practice.text}</p>
          <Link className="pf-button-secondary" href={learningApps[practice.app].href}>{practice.action}<span aria-hidden="true">→</span></Link>
        </article>)}</div>
      </section>
      <section className="home-guide" aria-labelledby="guide-title">
        <div className="home-section-heading"><h2 id="guide-title">学び方のヒント</h2></div>
        <LearningResources />
      </section>
      <section className="home-about" aria-labelledby="about-title">
        <details><summary id="about-title">Project Fluenceについて <span aria-hidden="true">＋</span></summary>
          <div className="home-about-content"><div><h2>英語＋専門分野で、可能性を広げる。</h2><p>Project Fluenceは、開発者の英語学習ノウハウを活用した英語学習プラットフォームです。語彙、会話、動画の学習をつなぎ、英語を通じて夢に近づく人を増やすことを目指しています。</p><p>各アプリは継続的に改善しています。今後は学習データをさらに連携し、より一人ひとりに合う体験を目指します。</p></div>
          <div><p className="pf-eyebrow">開発者</p><h3>黒木 勇人</h3><p>早稲田大学で情報理工学を学び、AIの研究開発とソフトウェア開発に取り組んでいます。英検1級、TOEFL iBT 116点、TOEIC満点、ケンブリッジ英検C2、Goethe-Zertifikat C2（読む・聞く・話す）を取得。ISEF 2025日本代表。</p><div className="home-about-links"><a href="https://yutokuroki.vercel.app/ja" target="_blank" rel="noopener noreferrer">プロフィール ↗</a><a href="https://www.linkedin.com/in/yutokuroki/" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a><a href="https://note.com/projectfluence" target="_blank" rel="noopener noreferrer">note ↗</a></div></div></div>
        </details>
      </section>
      <footer className="pf-footer"><span>© {new Date().getFullYear()} Project Fluence · 黒木 勇人</span><Link href="/privacy">プライバシーポリシー</Link></footer>
    </main>
  </>;
}
