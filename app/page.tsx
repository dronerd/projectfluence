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
          <p className="home-intro-copy">単語を学ぶ。会話で使う。動画で出会う。<br />今のあなたに合う練習から始めましょう。</p>
          <p className="home-account-note">登録せずに練習できます。<br />ログインすると学習の記録を保存できます。</p>
          <div className="home-intro-actions"><Link className="pf-button" href="/vocabstream">学習を始める <span aria-hidden="true">→</span></Link><Link className="home-text-link" href="/analytics">学習の記録を見る <span aria-hidden="true">↗</span></Link></div>
        </div>
        <aside className="home-project-intro" aria-labelledby="home-project-title">
          <h2 id="home-project-title">Project Fluence</h2>
          <p>単語・会話・動画で英語を学ぶ、AIを活用した学習プラットフォームです。</p>
          <p className="home-project-author">開発者 <strong>黒木 勇人</strong></p>
          <p>早稲田大学情報理工学科。自身の語学学習とAI研究の経験をもとに開発しています。</p>
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
          <div className="home-about-content">
            <section className="home-about-project" aria-labelledby="home-mission-title">
              <h2 id="home-mission-title">英語＋専門分野で、可能性を広げる。</h2>
              <p>Project Fluenceは、開発者の英語学習ノウハウを活用した英語学習プラットフォームです。語彙、会話、動画の学習をつなぎ、英語を通じて夢に近づく人を増やすことを目指しています。</p>
              <p>各アプリは継続的に改善しています。今後は学習データをさらに連携し、より一人ひとりに合う体験を目指します。</p>
            </section>
            <section className="home-developer" aria-labelledby="home-developer-title">
              <header className="home-developer-heading">
                <p className="pf-eyebrow">開発者</p>
                <h2 id="home-developer-title">黒木 勇人 <span lang="en">Yuto Kuroki</span></h2>
                <p>早稲田大学情報理工学科 · ISEF 2025日本代表</p>
              </header>
              <p>Project Fluenceを立ち上げ、英語学習アプリの開発と、noteでの学習方法の発信に取り組んでいます。</p>
              <div className="home-profile-grid">
                <section aria-labelledby="home-language-title">
                  <h3 id="home-language-title">語学学習と発信</h3>
                  <p>14歳で英検1級に上位1％で合格。TOEFL iBT 116/120、TOEIC 990/990を取得し、ケンブリッジ英検C2 Proficiencyではリーディング・リスニング満点で合格しました。</p>
                  <p>ドイツ語はGoethe-Zertifikat C2の読む・聞く・話す技能と、C1の書く技能を取得。ゲーテ・インスティトゥート学生新聞の編集にも携わりました。</p>
                </section>
                <section aria-labelledby="home-research-title">
                  <h3 id="home-research-title">AI研究と国際経験</h3>
                  <p>Nakatani RIESプログラムを通じ、ジョージア工科大学EPIC Labでロボット外骨格向けの深層学習を研究しています。</p>
                  <p>楽天AI for Businessのインターンでは、英語を主言語とするチームで、AIエージェントの安全性研究と評価実験に取り組みました。</p>
                </section>
              </div>
              <div className="home-about-links"><a href="https://yutokuroki.vercel.app/ja" target="_blank" rel="noopener noreferrer">詳しいプロフィール ↗</a><a href="https://www.linkedin.com/in/yutokuroki/" target="_blank" rel="noopener noreferrer">LinkedIn ↗</a><a href="https://note.com/projectfluence" target="_blank" rel="noopener noreferrer">note ↗</a></div>
            </section>
          </div>
        </details>
      </section>
      <footer className="pf-footer"><span>© {new Date().getFullYear()} Project Fluence · 黒木 勇人</span><Link href="/privacy">プライバシーポリシー</Link></footer>
    </main>
  </>;
}
