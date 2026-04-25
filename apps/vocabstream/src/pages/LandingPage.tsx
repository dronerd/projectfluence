// src/pages/LandingPage.tsx
import React, { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

export default function LandingPage() {
  const navigate = useNavigate();

  const scrollToTop = useCallback((e?: React.MouseEvent<HTMLElement>) => {
    e?.preventDefault?.();
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);


  // Server warmup state
  const [serverWarmed, setServerWarmed] = useState(false);
  const [serverWarming, setServerWarming] = useState(false);

  // ページマウント時にRenderのバックエンドサーバーをウォームアップ
  useEffect(() => {
      // only warm once per page mount
      let mounted = true;
      const warmUp = async () => {
        const API_URL = process.env.NEXT_PUBLIC_API_URL;
        setServerWarming(true);
        try {
          await fetch(`${API_URL}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "__warmup__", mode: "warmup" }),
          });
          if (!mounted) return;
          setServerWarmed(true);
        } catch (err) {
          console.error("Warmup failed", err);
        } finally {
          if (mounted) setServerWarming(false);
        }
      };
  
      warmUp();
      return () => {
        mounted = false;
      };
  }, []);

  return (
    <div
      className="landing-root"
      style={{ padding: "8px 2mm", paddingTop: "20px", fontFamily: "Inter, Arial, sans-serif", backgroundColor: "#e5e7eb" }}
    >
      {/* META: Helmet must be rendered inside component JSX */}
     

      {/* --- Styles (kept inline for single-file portability) --- */}
      <style>{`
        :root{
          --accent:#234E52;
          --muted:#666;
          --page-bg-1: #e5e7eb;
          --card-bg: #ffffff;
          --subcard-bg: #f1f5f8;
          --chip-bg: #f1f3f4;
          --btn-grad-a: #1e88ff;
          --btn-grad-b: #005ec2;
          --card-border: rgba(11,61,145,0.06);
          --radius: 14px;
          --container-max: 1200px;
          --hero-bottom-gap-mobile: 18px;
        }

       * {
          box-sizing: border-box;
        }

        html, body, #root {
          height: 100%;
          margin: 0;
          padding: 0;
          background: var(--page-bg-1); 
        }

        .landing-root {
          color: #111;
          width: 100%;
          min-height: 100vh;
          overflow-x: hidden;
          background: transparent;
        }

        :root {
          --base-font: clamp(13px, 1.8vw, 16px);
        }

        .landing-root {
          font-size: var(--base-font);
        }


        /* HERO */
        .hero-wrap{padding:22px 3.5vw}
        .hero-card{background:linear-gradient(180deg, rgba(255,255,255,0.98), rgba(250,252,255,0.98));border-radius:20px;padding:28px;box-shadow:0 12px 36px rgba(2,6,23,0.28);border:1px solid var(--card-border);max-width:var(--container-max);margin:0 auto;width:100%;box-sizing:border-box;display:flex;align-items:flex-start;gap:18px}
        .hero-grid{display:grid;grid-template-columns:1fr;gap:18px;align-items:center}
        .hero-main{padding-right:8px;min-width:0}

        /* title row with logo */
        .hero-title-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
        .hero-logo{height:200px;width:auto;object-fit:contain}

        h1{font-size: clamp(26px, 4.8vw, 44px); margin:6px 0;line-height:1.02;overflow-wrap:break-word;word-break:break-word}
        p.lead{margin-top:8px;color:#444;font-size: clamp(14px, 1.9vw, 17px);max-width:980px;overflow-wrap:break-word}

        .actions{margin-top:18px;display:flex;gap:12px;flex-wrap:wrap}

        /* Primary CTA (same style as header) */
        .cta-btn {
          font-weight: 800;
          color: #fff;
          border: none;
          padding: 12px 18px;
          border-radius: 12px;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(90deg, var(--btn-grad-a) 0%, var(--btn-grad-b) 100%);
          cursor: pointer;
          box-shadow: 0 10px 26px rgba(30,136,255,0.14);
          transition: transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease;
          font-size: clamp(14px, 1.9vw, 17px);
        }
        .cta-btn:hover, .cta-btn:focus { transform: translateY(-3px); box-shadow: 0 18px 40px rgba(30,136,255,0.18); outline: none; }

        /* Secondary button (link style but elevated) */
        .intro-btn {
          font-size: clamp(13px, 1.6vw, 16px);
          padding: 10px 14px;
          border-radius:10px;
          cursor:pointer;
          background: linear-gradient(180deg,#ffffff 0%, #f7fbff 100%);
          border: 2px solid rgba(0,123,255,0.18);
          color: #005ec2;
          font-weight: 800;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 6px 18px rgba(2,6,23,0.04);
          transition: transform 140ms ease, box-shadow 140ms ease;
          text-decoration: none;
        }
        .intro-btn:hover, .intro-btn:focus { transform: translateY(-2px); box-shadow: 0 10px 22px rgba(2,6,23,0.06); outline: none; }

        /* subtle chip under title */
        .hero-chip{display:inline-block;background:var(--chip-bg);padding:6px 10px;border-radius:999px;font-weight:700;color:#0b3d91;border:1px solid rgba(11,61,145,0.06)}

        /* founder box styling */
        .founder-box{background:var(--subcard-bg);padding:16px;border-radius:12px;border:1px solid rgba(0,0,0,0.04);box-sizing:border-box;min-width:230px}
        .founder-top{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
        .founder-avatar{width:72px;height:72px;border-radius:12px;object-fit:cover;flex-shrink:0;max-width:100%}
        .founder-name{font-weight:900;font-size:1.25em;color:#0f2540}
        .founder-meta{color:#333; white-space:normal; overflow-wrap:break-word; word-break:break-word}
        .founder-meta-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:6px;font-size:0.95em;color:#333}

        /* grid cards */
        main{width:100%;padding:18px 3.5vw}
        .grid-stack{max-width:var(--container-max);margin:0 auto;display:grid;gap:18px}
        .card{background:var(--card-bg);padding:18px;border-radius:14px;box-shadow:0 10px 26px rgba(2,6,23,0.06);border:1px solid var(--card-border);box-sizing:border-box;transition:transform 160ms ease, box-shadow 160ms ease}
        .card:hover{transform: translateY(-6px);box-shadow:0 22px 48px rgba(2,6,23,0.08)}

        @media(min-width:760px){
          .hero-grid{grid-template-columns:1fr 380px;gap:24px}
          .hero-card{padding:32px}
          .grid-stack{grid-template-columns:repeat(2, minmax(0,1fr));grid-auto-rows:auto}
          .hero-logo{transform: translateX(-8px)}
          .founder-avatar{width:84px;height:84px}
        }

        @media(max-width:700px){
          .hero-wrap{padding:8px 2mm; margin-bottom: var(--hero-bottom-gap-mobile);} 
          main{padding:8px 2mm; margin-top: 8px;}
          .hero-card{max-width:100%;flex-direction:column;padding:16px}
          .grid-stack{max-width:100%;grid-template-columns:1fr;gap:12px}
          .card{padding:12px}
          .founder-box{width:100%;padding:12px;border-radius:10px}
          .founder-avatar{width:64px;height:64px;border-radius:50%}
          .hero-title-row{flex-direction:column;align-items:flex-start;gap:8px}
          .hero-logo{height:120px}
          .hero-card{padding:14px}
        }

        footer{max-width:var(--container-max);margin:28px auto 0;padding:18px;text-align:center;color:#dfeeff}

        /* accessibility focus */
        .landing-root a:focus, .landing-root button:focus{box-shadow:0 0 0 4px rgba(30,136,255,0.12);outline:none}
      `}</style>

      {/* --- Hero / Header section --- */}
      <section className="hero-wrap">
        <div className="hero-card" role="region" aria-labelledby="hero-title">
          <div className="hero-grid">
            <div className="hero-main">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="hero-chip">Project Fluence</span>
              </div>

              <div className="hero-title-row">
                <h1 id="hero-title" style={{ margin: 5 }}>VocabStream</h1>
                <img src="/images/vocabstream.png" alt="VocabStream logo" className="hero-logo" />
              </div>

              <p><strong>〜英単語は「英語で」学ぶ！〜</strong></p>

              <p className="lead">
                VocabStreamは、
                <a href="https://yutokuroki.vercel.app/ja" target="_blank" rel="noopener noreferrer" style={{textDecoration: 'underline' }}><strong>黒木勇人</strong></a>
                が創設・開発・運営する
                <a href="https://projectfluence.vercel.app" target="_blank" rel="noopener noreferrer" style={{textDecoration: 'underline' }}><strong>Project Fluence</strong></a>
                の一環として制作された英単語学習アプリです。英単語を日本語訳と結び付けて覚えるのではなく、英語による定義と例文と結び付けて、自然に英語を理解・運用する力を育てます。
              </p>

              <div className="actions" role="navigation" aria-label="Primary actions">
                <button
                  onClick={() => { navigate("/learn"); scrollToTop(); }}
                  className="cta-btn"
                  aria-label="アプリを使用"
                >
                  アプリを使用
                </button>

                <a
                  href="https://note.com/projectfluence"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="intro-btn"
                  role="button"
                >
                  Noteを見る
                </a>

                <a
                  href="https://projectfluence.vercel.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="intro-btn"
                  role="button"
                >
                  Project Fluenceのホームページ
                </a>
              </div>
            </div>

            <aside className="founder-box" aria-labelledby="founder-title">
              <h3 id="founder-title" style={{ margin: 0, fontSize: "1rem", textTransform: "uppercase", color: "#334" }}>
                <strong>プロジェクト創設/開発・運営</strong>
              </h3>

              <div className="founder-top" style={{ marginTop: 12 }}>
                <img src="/vocabstream/profile.JPG" alt="Yuto Kuroki" className="founder-avatar" />

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <a className="founder-name" href="https://yutokuroki.vercel.app/ja" target="_blank" rel="noopener noreferrer">
                      黒木勇人
                    </a>
                  </div>

                  <div className="founder-meta-row">
                    <div className="founder-meta" style={{ fontSize: "0.87em" }}>
                      早稲田大学 情報理工学科２年
                    </div>
                    <div className="founder-meta" style={{ fontSize: "0.85em" }}>
                      yutokuroki.projectfluence@gmail.com
                    </div>
                  </div>
                </div>
              </div>

              <p style={{ marginTop: 12, color: "#333", fontSize: "0.95em", lineHeight: 1.5 }}>
              専門性＋英語力で夢を実現する人を増やすためにProject Fluenceを創設し、英語学習法を発信中。中2で英検1級上位1％合格。現在は TOEFL116点、TOEIC満点、ケンブリッジ英検C2 (読む・聞くは満点), 世界最難関のドイツ語検定試験 Goethe-Zertifikat C2（読む・聞く・話す）を取得。高校時代から人工知能分野で研究開発に取り組み、学会での受賞や国際学生科学技術フェア(ISEF2025)日本代表などの経験を持つ。
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <a
                href="https://yutokuroki.vercel.app/ja"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontWeight: 800, color: '#0b3d91', textDecoration: 'underline' }}
              >
                → プロフィール
              </a>

              <a
                href="https://www.linkedin.com/in/yutokuroki/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontWeight: 800, color: '#0b3d91', textDecoration: 'underline' }}
              >
                → LinkedIn
              </a>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* --- Main content cards --- */}
      <main>
        <div className="grid-stack">
          <article className="card" aria-labelledby="about-title">
            <h2 id="about-title" style={{ marginTop: 0 }}>About</h2>

            {/* Use a div wrapper to avoid nested <p> tags */}
            <div style={{ marginTop: 8, color: "#444", lineHeight: 1.8 }}>
              <p className="lead">
                <strong>VocabStream</strong>は、
                <a href="https://yutokuroki.vercel.app/ja" target="_blank" rel="noopener noreferrer"><strong>黒木勇人</strong></a>
                が創設・開発・運営する
                <a href="https://projectfluence.vercel.app" target="_blank" rel="noopener noreferrer"><strong>Project Fluence</strong></a>
                の一環として制作された英単語学習アプリです。
                <br />
                <strong>Project Fluenceでは英語を英語で学ぶことで、より本質的な英語力を得ることができると考えています。</strong>Noteでご紹介している英語学習方法を効率的に実行するためのアプリを開発しており、
                <strong>VocabStream</strong>は単語学習にフォーカスを当てたアプリとなっています。
                <br />
                現在は安定して動作する一部の機能のみを公開しています。現在利用可能な機能は、
                <a href="/vocabstream/learn" style={{ textDecoration: "underline" }}><strong>単語を３択レッスン・文章穴埋めを通して学習する機能</strong></a>
                （合計約3000単語）と、英語学習に役立つ
                <a href="/vocabstream/prompts" style={{ textDecoration: "underline" }}><strong>ChatGPTのプロンプト集</strong></a>
                、
                <a href="/speakwise" style={{ textDecoration: "underline" }}><strong>Speakwise</strong></a>
                です。
                <br />
                現在開発中の機能：熟語の学習、専門分野の単語の学習、ビジネス英語表現の学習、復習機能、AIチャット機能など。
                <br />
                今後のアップデートにてこれらの機能を順次提供してまいります。楽しみにしていてください！
              </p>
            </div>
          </article>

          <article className="card">
            <h2 style={{ marginTop: 0 }}>
              <a href="https://projectfluence.vercel.app" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
                <strong>Project Fluence</strong>
              </a>
              について
            </h2>
            <div style={{ textAlign: "center" }}>
              <a
                href="https://projectfluence.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-block" }}
              >
                <img
                  src="/vocabstream/projectfluence.png"
                  alt="Project Fluence Logo"
                  style={{
                    width: "100%",
                    maxWidth: 300,
                    height: "auto",
                    display: "block",
                    margin: "8px 0",
                    borderRadius: "12px",
                    transition: "transform 0.2s ease",
                  }}
                />
              </a>
            </div>

            <p style={{ marginTop: 8, color: "#444", lineHeight: 1.8 }}>
              効率的に英語を学び、世界で活躍する力を身につける。
              <a href="https://projectfluence.vercel.app" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
                <strong>Project Fluence</strong>
              </a>
              はそんな学びを応援する個人プロジェクトです。英語＋専門分野の力で夢を実現する人を増やすことを目指しています。
              <br />
              <a href="https://yutokuroki.vercel.app/ja" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
                <strong>黒木勇人</strong>
              </a>
              が効果的な英語学習法を
              <a href="https://note.com/projectfluence" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
                <strong>Note</strong>
              </a>
              で紹介し、自ら開発した英語学習アプリを提供します。
              <br />
              ＊ 大学生による趣味の開発活動であるため、アプリの一部機能が安定していない可能性があります。
            </p>
          </article>

          <article className="card">
            <h2 style={{ marginTop: 0 }}>なぜ英語を学ぶのか</h2>
            <p style={{ marginTop: 8, color: "#444", lineHeight: 1.8 }}>
              <img
                src="/vocabstream/learningenglish.png"
                alt="English Learning Logo"
                style={{
                  width: "100%",
                  maxWidth: 350,
                  height: "auto",
                  display: "block",
                  margin: "8px auto",
                  borderRadius: "12px",
                }}
              />
              英語を学ぶことで出会える人や文化、広がる可能性は、学習の努力をはるかに上回る価値を持っています。
              <strong>英語はまさに「一生もののスキル」です。</strong>
              <br />中高では成績や受験に、大学では授業や研究に、そして社会人になれば海外とのやり取りや情報収集に大きな力を発揮します。 翻訳を待たずに世界中の情報にアクセスでき、キャリアや人生の選択肢を大きく広がってくれるのです。
              <br /><strong>これほどリターンの大きい学習分野は他に多くありません。</strong>
              <br />もちろん、英語学習は時に大変で、思わず投げ出したくなる瞬間もあるでしょう。 
              <strong>しかし、コツコツ続けていけば必ず「自分の言葉で伝えられる」日がやってきます。</strong> そのときの達成感は何ものにも代えがたいはずです。 そして英語を通じて海外の人とつながれれば、新しい価値観や考え方に触れ、自分の世界も大きく広がっていきます。
            </p>
          </article>

          <article className="card">
            <h2 style={{ marginTop: 0 }}>効果的な英単語学習方法 — 英単語は英語で学ぶ</h2>
            <p style={{ marginTop: 8, color: "#444", lineHeight: 1.8 }}>
              ＊英単語学習以外の英語学習に関する効果的な方法については、<a href="https://note.com/projectfluence" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
                <strong>Note記事</strong>
              </a>
              をご覧ください。
              <br />
              従来の学習では、英単語や英文を日本語に訳して覚える<strong>「日英変換」</strong>の方法が一般的です。
              しかし、この方法では<strong>思考が翻訳に頼り、言いたいことがすぐに出てこない</strong>という問題があります。
              <br />私は、本質的な英語力とは<strong>日本語と同じように意味をそのまま理解し、アイデアを直接言葉にできること</strong>だと考えます。
              日本語を逐語的に分解しないように、英語も自然に理解・発信できる状態が理想です。
              <br />そのためには、英単語を日本語訳で覚えるのではなく、<strong>英語の定義や例文と結びつけて学ぶこと</strong>をおすすめします。
              これは、国語辞典で知らない日本語をよりやさしい日本語で理解するのと同じ仕組みです。
              <br />英語の定義や例文で学ぶことで、
              ・使われる場面
              ・自然な文の形
              ・微妙なニュアンスの違い
              といった細かな部分も理解できます。
              <br />たとえば<strong> “Perseverance” </strong>の例を見てみましょう。
              <br />(定義) “Perseverance means keeping on and not giving up, even when something is hard or takes a long time.”
              <br /> (例文) “She showed great perseverance by practicing the piano every day until she finally mastered the song.”
              <br />(類義語) Determination, Persistence, Dedication, Endurance
              <br />(対義語) Giving up, Surrender
              <br />“Perseverance” は日本語で「忍耐」と訳されますが、英英で学ぶことでより多くの情報を得られ、
              「忍耐」という言葉を思い出さなくても、自然に “Perseverance” が口から出てくるようになると思います。
              <br /><strong>このように英語の定義や例文を通じて学ぶことで、単語は「生きたイメージ」として定着します。</strong>
              <br /><strong>そして、VocabStream ではこの方法で3000語以上の単語を学習できます。</strong>
            </p>
          </article>
        </div>

        <footer style={{ maxWidth: 'var(--container-max)', margin: "28px auto 0", padding: 18, textAlign: "center", color: "#dfeeff" }}>
          <div>All content © 2026 Project Fluence — 黒木 勇人
          </div>
          <div style={{ marginTop: 8 }}>
            <a href="/vocabstream/privacy" style={{ color: '#dfeeff', textDecoration: 'underline' }}>Privacy Policy</a>
          </div>
        </footer>
      </main>
    </div>
  );
}
