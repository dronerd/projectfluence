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
          <p className="home-project-author"><a href="https://yutokuroki.vercel.app/ja" target="_blank" rel="noopener noreferrer">開発者 <strong>黒木 勇人</strong><span aria-hidden="true">↗</span></a></p>
          <p>早稲田大学情報理工学科２年。自身の語学学習とAI研究の経験をもとに開発しています。</p>
          <a className="home-profile-link" href="https://yutokuroki.vercel.app/ja" target="_blank" rel="noopener noreferrer">→プロフィール<span className="sr-only">（新しいタブで開く）</span></a>
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
                <p className="pf-eyebrow"><a href="https://yutokuroki.vercel.app/ja" target="_blank" rel="noopener noreferrer">開発者 ↗</a></p>
                <h2 id="home-developer-title">黒木 勇人 <span lang="en">Yuto Kuroki</span></h2>
                <p>早稲田大学情報理工学科２年</p>
              </header>
              <div className="home-profile-grid">
                <section aria-labelledby="home-language-title">
                  <h3 id="home-language-title">語学学習と発信</h3>
                  <p>14歳で英検1級に上位1％の成績で合格。TOEFL iBT 116/120、TOEIC 990/990を取得し、ケンブリッジ英検C2 Proficiencyではリーディング・リスニング満点で合格しました。</p>
                  <p>高校からドイツ語を学び、現在はGoethe-Zertifikat C2の読む・聞く・話す技能と、C1の書く技能を取得し、ネイティブに近い高度なドイツ語力を身につけています。</p>
                  <p>外国語の習得を通して世界に挑戦する人を日本から増やすため、英語学習プラットフォームProject Fluenceの開発や、<a className="home-inline-link" href="https://note.com/yutokuroki" target="_blank" rel="noopener noreferrer">note<span className="sr-only">（新しいタブで開く）</span></a>での学習方法の発信に取り組んでいます。</p>
                </section>
                <section aria-labelledby="home-research-title">
                  <h3 id="home-research-title">AI研究と国際経験</h3>
                  <p>高校時代からAI分野の研究に取り組んでいます。高校３年時には、ドローン配送の最適化アルゴリズムに関する研究でJSEC2025のソニー賞を受賞し、国際学生科学技術フェア（ISEF2025）に日本代表として出場しました。また、<a className="home-inline-link" href="https://www.mext.go.jp/b_menu/houdou/2025/1416581_00001.htm" target="_blank" rel="noopener noreferrer">文部科学大臣特別賞<span className="sr-only">（新しいタブで開く）</span></a>を受賞しました。</p>
                  <p>大学１年時にはRakuten AI for Businessでインターンを行い、2026年夏には中谷財団の奨学生として、ジョージア工科大学で脳卒中患者の歩行を支援する深層学習モデルを研究しました。現在は機械学習、RAG、Biomedical Knowledge Graph、ヘルスケアへの応用などに興味を持っています。</p>
                </section>
                <section className="home-profile-university" aria-labelledby="home-university-title">
                  <h3 id="home-university-title">大学</h3>
                  <p>早稲田大学情報理工学科２年です。早稲田大学基幹理工学部の２〜４年生の中から、学業成績が特に優秀な６人に贈られる大隈記念奨学金を受給しています。</p>
                </section>
              </div>
              <div className="home-about-links">
                <a href="https://yutokuroki.vercel.app/ja" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="7" r="3.5"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/></svg>プロフィール ↗</a>
                <a href="https://www.linkedin.com/in/yutokuroki" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.4 2H3.6C2.7 2 2 2.7 2 3.6v16.8c0 .9.7 1.6 1.6 1.6h16.8c.9 0 1.6-.7 1.6-1.6V3.6c0-.9-.7-1.6-1.6-1.6ZM8 18.7H5.1V9.3H8v9.4ZM6.6 8a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Zm12.1 10.7h-2.9v-4.6c0-1.1 0-2.5-1.5-2.5s-1.8 1.2-1.8 2.4v4.7H9.6V9.3h2.8v1.3h.1a3.1 3.1 0 0 1 2.8-1.5c3 0 3.4 1.9 3.4 4.4v5.2Z"/></svg>LinkedIn ↗</a>
                <a href="https://note.com/yutokuroki" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 19V5h4l7 10V5h3v14h-4L8 9v10H5Z"/></svg>note ↗</a>
              </div>
            </section>
          </div>
        </details>
      </section>
      <footer className="pf-footer"><span>© {new Date().getFullYear()} Project Fluence · 黒木 勇人</span><Link href="/privacy">プライバシーポリシー</Link></footer>
    </main>
  </>;
}
