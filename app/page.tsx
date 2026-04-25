"use client";

import React, { useCallback, useState } from "react";
import Link from "next/link";
import Image from "next/image";

export default function ExtraPage() {
  const scrollToTop = useCallback((e?: React.MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault?.();
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  // --- Copyable prompt helper component ---
  function CopyablePrompt({ label, text }: { label?: string; text: string }) {
    const [copied, setCopied] = useState(false);

    async function handleCopy() {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch (err) {
        console.error("Clipboard write failed:", err);
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch (innerErr) {
          console.error("Fallback copy failed:", innerErr);
          alert("コピーに失敗しました。テキストを手動で選択してください。");
        }
      }
    }

    return (
      <div className="bg-white border rounded-lg p-3 shadow-sm flex flex-col md:flex-row gap-3 items-start md:items-center">
        <div className="flex-1 min-w-0">
          {label && <div className="text-sm text-gray-500 mb-1">{label}</div>}
          <pre className="whitespace-pre-wrap break-words text-sm text-gray-900 p-2 bg-neutral-100 rounded-md max-h-48 overflow-auto">{text}</pre>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="px-3 py-2 text-sm font-medium rounded-full border shadow-sm hover:brightness-95 focus:outline-none"
            aria-label={`Copy prompt${label ? `: ${label}` : ''}`}>
            {copied ? "コピーされました!" : "コピーする"}
          </button>
        </div>
      </div>
    );
  }

  // --- The prompts to show / copy ---
  const prompts = [
    {
      label: "英会話の練習用（英語のレベルをご自身で設定してください）",
      text:
  `I want to practice speaking English. My English level: (A1 / A2 / B1 / B2 / C1 / C2).

  Please:
  1. Ask me one question at a time about (everyday life / university studies / future plans, etc.).
  2. Wait for my answer.
  3. Give clear feedback on:
    - Grammar
    - Vocabulary
    - Natural phrasing
  4. Show a corrected version of my answer.
  5. Then ask the next question.

  Use mostly words at my level, but occasionally include slightly more advanced vocabulary.`
    },
    {
      label: "英検対策（例：１級の面接）",
      text:
  `I want to practice for the Eiken Grade 1 speaking test.

  Please:
  1. Give me a realistic Eiken-style topic.
  2. Ask me to give a short speech (about 2 minutes).
  3. After my answer, provide:
    - A corrected version
    - Feedback on structure, vocabulary, and coherence
    - Suggestions for higher-level expressions
  4. Then ask 2–3 follow-up questions like an examiner.

  Keep the format close to the real test.`
    },
    {
      label: "TOEFLライティングの練習",
      text:
  `Please give me a realistic TOEFL iBT writing task (Task 1 or Task 2).

  After I write my response, please:
  1. Correct grammar and sentence structure
  2. Rewrite my answer in a more natural and high-scoring way
  3. Suggest better vocabulary and expressions
  4. Give a brief score estimate and explain why

  Focus on helping me improve toward a higher band score.`
    },
    {
      label: "自由ライティングの添削",
      text:
  `Please revise the following text.

  Give me:
  1. A corrected version
  2. A more natural / fluent version
  3. A brief explanation of key mistakes
  4. Suggestions for improving vocabulary and style`
    },
    {
      label: "学んだ表現のリスト化",
      text:
  `Based on our conversation today, create a list of useful vocabulary and phrases I learned.

  For each item, include:
  - Meaning
  - Example sentence
  - When to use it

  Focus on expressions that are practical and reusable.`
    }
  ];

  const prompts2 = [
    {
      label: "単語の説明を求める",
      text:
  `For the word (" "), please provide:
  - A simple definition (using easier words)
  - 1–2 example sentences
  - Synonyms
  - Antonyms
  - Common collocations (if any)`
    },
    {
      label: "自作した例文の添削",
      text:
  `Please correct and improve this sentence.

  Show:
  1. Corrected version
  2. More natural version
  3. Brief explanation of the changes`
    }
  ];

  // --- note articles (added as stylish cards) ---
  const noteArticles = [
    {
      key: "note Article1",
      href: "https://note.com/projectfluence/n/nd806d6fa00ec",
      title:
        "日本にいながらネイティブ級へ─英語力を効果的に伸ばす学習方法｜英検１級・TOEIC満点・TOEFL116/120・ドイツ語上級",
    },
    {
      key: "note Article2",
      href: "https://note.com/projectfluence/n/n751ab984987a",
      title:
        "英語学習にも応用できる！第２外国語（ドイツ語）から見えてきた効果的な言語学習法",
    },
    {
      key: "note Article3",
      href: "https://note.com/projectfluence/n/n71bd9003af29",
      title:
        "（上級者向け）日本にいながら英語力をさらに高める効果的な方法",
    },
  ];

  // for stable control of mobile menu. 
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {/* Sticky Banner (same as before) */}

      <div className="fixed top-0 left-0 w-full bg-gradient-to-r from-indigo-600 to-cyan-500 text-white py-7 z-50 shadow-md">
        <div className="max-w-[880px] sm:max-w-3xl md:max-w-7xl mx-auto px-4 sm:px-7 relative flex items-center">
          <div className="absolute left-4 flex items-center z-50">
            <button
              onClick={scrollToTop}
              aria-label="Scroll to top"
              className="flex items-center focus:outline-none transform transition-transform duration-200 active:scale-105"
            >
              <Image
                src="/images/logo.png"
                alt="Project Fluence logo"
                width={40}
                height={40}
                className="rounded-full object-cover"
              />
            </button>
          </div>

          <div className="absolute inset-x-0 flex justify-center pointer-events-none">
            <button
              onClick={scrollToTop}
              aria-label="Scroll to top"
              className="pointer-events-auto text-base font-normal hover:underline bg-transparent border-none cursor-pointer"
            >
              <span className="inline md:hidden text-lg"><strong>ページトップ</strong></span>
              <span className="hidden md:inline text-xl"><strong>ページトップへ </strong>- Project Fluence</span>
            </button>
          </div>

          <div className="absolute right-4 flex items-center gap-3">
            {/* Hamburger Button */}
            <button
              onClick={() => setMenuOpen(true)}
              className="text-white text-2xl md:text-3xl focus:outline-none"
              aria-label="Open menu"
            >
              ☰
            </button>
          </div>
        </div>
      </div>

      <main className="w-full min-h-screen bg-neutral-200 px-1 pt-24 pb-12">
        <div className="max-w-[880px] sm:max-w-3xl md:max-w-7xl mx-auto px-4">
          <section className="bg-white rounded-2xl shadow-lg p-6 md:p-12 grid md:grid-cols-3 gap-6 items-center">
            <div className="md:col-span-2 min-w-0">
              <div className="flex items-center gap-4 md:gap-6">
                <div className="w-20 h-20 md:w-28 md:h-28 relative flex-shrink-0"> 
                  <Image 
                  src="/images/logo.png" 
                  alt="Project Fluence logo large" 
                  fill sizes="(max-width: 768px) 80px, 112px" 
                  className="object-cover rounded-xl" /> 
                </div>


                <div className="min-w-0">
                  <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold leading-tight">Project Fluence</h1>
                  <p className="text-xs md:text-sm text-gray-600 mt-1">～あなたの未来に、英語の力を～</p>
                </div>
              </div>

              <p className="mt-6 text-base md:text-lg break-words whitespace-normal max-w-full">
                <strong>Project Fluence</strong>は、開発者の英語学習ノウハウを活用したAIアプリが連携して学習体験を最適化する、<strong>英語学習のエコシステム</strong>です。
              </p>
              <br/>
              <p className="text-base md:text-lg mb-1 break-words whitespace-normal max-w-full">
                英語＋専門分野の力で夢を実現する人を増やすことを目指しています。
                <a
                  className="underline"
                  href="https://yutokuroki.vercel.app/ja"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                </a>
                効果的な英語学習法を
                 <a
                      className="underline"
                      href="https://note.com/projectfluence"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                    <strong>note</strong>
                  </a>
                で紹介し、開発したAI英語学習アプリも提供します。
              </p>
            </div>

            <aside className="md:col-span-1 bg-neutral-100 rounded-xl p-4 shadow-inner w-full min-w-0">
              <h3 className="text-lg uppercase text-gray-700"><strong>開発者</strong></h3>

              <div className="mt-4 flex items-center gap-4 min-w-0">
                
                {/* Clickable Profile Image */}
                <Link
                  href="https://yutokuroki.vercel.app/ja"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-16 h-16 relative rounded-full overflow-hidden bg-gray-800 flex-shrink-0 block"
                >
                  <Image
                    src="/images/profile2.JPG"
                    alt="Yuto Kuroki profile"
                    fill
                    sizes="(max-width: 768px) 64px, 64px"
                    className="object-cover"
                  />
                </Link>

                <div className="min-w-0">
                  <Link
                    aria-label="Profile"
                    href="https://yutokuroki.vercel.app/ja"
                    className="font-medium text-lg md:text-2xl block truncate"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <strong>黒木勇人</strong>
                  </Link>

                  <p className="text-sm text-gray-800 whitespace-normal break-words">
                    早稲田大学 情報理工学科２年
                  </p>
                </div>
              </div>

              <p className="mt-4 text-sm text-gray-800 whitespace-normal break-words">    
               中2で英検1級上位1％合格。現在は TOEFL iBT 116点、TOEIC 満点、ケンブリッジ英検C2 (読む・聞くは満点)。 世界最難関のドイツ語検定試験 Goethe-Zertifikat C2（読む・聞く・話す）も取得。高校時代からAI分野で研究開発やソフトウェア開発に取り組み、ISEF2025日本代表などの経験を持つ。    
              </p>

              <div className="mt-3">
                <Link href="https://yutokuroki.vercel.app/ja" className="underline text-lg break-words" target="_blank" rel="noopener noreferrer">→<strong>プロフィール</strong></Link>
                <br/>
                <Link href="https://www.linkedin.com/in/yutokuroki/" className="underline text-lg break-words" target="_blank" rel="noopener noreferrer">→<strong>LinkedIn</strong></Link>
              </div>
            </aside>
          </section>

          {/* Apps Section */}
          <section id="apps" className="mt-8 bg-white rounded-2xl p-6 shadow">
            <h2 className="text-2xl font-bold">アプリ一覧</h2>

            <p className="mt-3 text-gray-700 leading-relaxed">
              これらのアプリは現在開発中です。今後のアップデートをお楽しみに！
              これらのアプリは<strong>相互にデータを活用</strong>し、学習体験を最適化することを目指しています。
              例えば、<strong>VocabStream</strong>で学習した単語データをもとに、
              <strong>VidMatcher</strong>では理解しやすい動画を推薦し、
              <strong>SpeakWiseAI</strong>ではあなたの語彙レベルに合わせた会話練習を提供します。
            </p>

            <div className="mt-6 grid md:grid-cols-3 gap-6">
              
              {/* VocabStream */}
              <div className="bg-neutral-50 rounded-xl p-5 shadow-sm flex flex-col">
                <div className="flex items-center gap-3">
                  <Image src="/images/vocabstream.png" alt="VocabStream" width={60} height={60} className="rounded-md" />
                  <h3 className="text-xl font-semibold">VocabStream</h3>
                </div>

                <p className="mt-3 text-gray-700 text-sm leading-relaxed">
                  英単語を「英語の定義＋例文」で学習するアプリ。  
                  記憶ではなく「理解」で語彙力を伸ばします。
                </p>

                <ul className="mt-3 text-sm text-gray-600 list-disc list-inside space-y-1">
                  <li>英英ベースの単語学習</li>
                  <li>例文による文脈理解</li>
                  <li>語彙の定着を重視</li>
                </ul>

                <Link
                  href="/vocabstream"
                  className="mt-auto inline-block text-center 
                  bg-gradient-to-r from-indigo-600 to-cyan-500 
                  text-white px-5 py-2.5 rounded-full 
                  font-medium shadow-md 
                  hover:shadow-lg hover:scale-[1.02] hover:brightness-110 
                  transition-all duration-200"                  >
                  アプリを開く →
                </Link>
              </div>

              {/* VidMatcher */}
              <div className="bg-neutral-50 rounded-xl p-5 shadow-sm flex flex-col">
                <div className="flex items-center gap-3">
                  <Image src="/images/videofinder.png" alt="VidMatcher" width={60} height={60} className="rounded-md" />
                  <h3 className="text-xl font-semibold">VidMatcher</h3>
                </div>

                <p className="mt-3 text-gray-700 text-sm leading-relaxed">
                  YouTube動画を英語レベル・語彙・分野に基づいて推薦する学習エンジン。
                </p>

                <ul className="mt-3 text-sm text-gray-600 list-disc list-inside space-y-1">
                  <li>語彙一致度ベース推薦</li>
                  <li>レベル別フィルタ</li>
                  <li>専門分野対応</li>
                </ul>

                <a
                  href="https://video.projectfluence.vercel.app"
                  target="_blank"
                  className="mt-auto inline-block text-center 
                  bg-gradient-to-r from-indigo-600 to-cyan-500 
                  text-white px-5 py-2.5 rounded-full 
                  font-medium shadow-md 
                  hover:shadow-lg hover:scale-[1.02] hover:brightness-110 
                  transition-all duration-200"                  >
                  アプリを開く →
                </a>
              </div>
              
              {/* SpeakWiseAI */}
              <div className="bg-neutral-50 rounded-xl p-5 shadow-sm flex flex-col">
                <div className="flex items-center gap-3">
                  <Image src="/images/speakwise.png" alt="SpeakWiseAI" width={60} height={60} className="rounded-md" />
                  <h3 className="text-xl font-semibold">SpeakWiseAI</h3>
                </div>

                <p className="mt-3 text-gray-700 text-sm leading-relaxed">
                  生成AIを活用した英会話トレーニング。  
                  リアルタイムでフィードバックを提供。
                </p>

                <ul className="mt-3 text-sm text-gray-600 list-disc list-inside space-y-1">
                  <li>AI会話練習</li>
                  <li>文法・語彙フィードバック</li>
                  <li>レベル適応型学習</li>
                </ul>

                <a
                  href="/speakwise"
                  className="mt-auto inline-block text-center 
                  bg-gradient-to-r from-indigo-600 to-cyan-500 
                  text-white px-5 py-2.5 rounded-full 
                  font-medium shadow-md 
                  hover:shadow-lg hover:scale-[1.02] hover:brightness-110 
                  transition-all duration-200"                >
                  アプリを開く →
                </a>
              </div>

            </div>
          </section>
          

          {/* Recent notes - updated: show 3 stylish rectangular cards */}
          <section id="notes" className="mt-8 bg-white rounded-2xl p-6 shadow">
            <h2 className="text-2xl font-bold">note記事</h2>
            <p>
              noteでは、英語学習の方法やモチベーションの保ち方、私自身の学習体験から得た気づきなどを発信しています。ぜひご覧ください！
            </p>
            <a
              href="https://note.com/projectfluence"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3 underline text-md font-medium"
            >
              すべてのnote記事を見る →
            </a>
            <ul className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {noteArticles.map((note) => (
                <li key={note.key} className="py-0.5">
                  <article className="h-full bg-neutral-50 border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col justify-between">
                    <div>
                      <div className="inline-block px-2 py-1 text-xs font-semibold uppercase rounded-md bg-blue-50 text-blue-700 mb-2">note</div>
                      <a href={note.href} target="_blank" rel="noopener noreferrer" className="text-sm md:text-base font-medium underline break-words">
                        {note.title}
                      </a>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          </section>

          {/* なぜ英語を学ぶのか */}
          <section
            id="english-motivation"
            className="mt-8 bg-white rounded-2xl p-6 shadow"
          >
            <h2 className="text-2xl font-bold">英語を学ぶモチベーション</h2>

            <div className="grid md:grid-cols-[1fr_auto] gap-6 items-start">
            
              {/* Text */}
              <div className="text-gray-700 leading-relaxed space-y-3">
                <p>
                  英語を学ぶことで出会える人や文化、広がる可能性は、学習の努力をはるかに上回る価値を持っています。
                </p>
                <p>
                  <strong>英語はまさに「一生もののスキル」です。</strong>
                </p>
                <p>
                  中高では成績や受験に、大学では授業や研究に、そして社会人になれば海外とのやり取りや情報収集に大きな力を発揮します。翻訳を待たずに世界中の情報にアクセスでき、キャリアや人生の選択肢を大きく広げてくれるのです。
                </p>
                <p>
                  <strong>これほどリターンの大きい学習分野は他に多くありません。</strong>
                </p>
                <p>
                  もちろん、英語学習は時に大変で、思わず投げ出したくなる瞬間もあるでしょう。しかし、コツコツ続けていけば必ず「自分の言葉で伝えられる」日がやってきます。そのときの達成感は何ものにも代えがたいはずです。そして英語を通じて海外の人とつながれれば、新しい価値観や考え方に触れ、自分の世界も大きく広がっていきます。
                </p>
              </div>

              {/* Image */}
              <div className="flex justify-center md:justify-end">
                <Image
                  src="/images/learningenglish.png"
                  alt="英語学習のイメージ"
                  width={500}
                  height={300}
                  className="rounded-xl object-cover w-full max-w-[220px]"
                />
              </div>
            </div>
          </section>

          <section id="method" className="mt-8 bg-white rounded-2xl p-6 shadow"> 
            <h3 className="text-2xl font-semibold mb-2">効果的な英語学習方法</h3>
            <p className="text-xs mt-2 font-semibold text-gray-800">＊以下は私が英語学習を通じて得た気づきや経験に基づいています。万人に当てはまるわけではないことをご了承ください。</p>
            <div className="mb-8">
              <br/>
              <p className="text-gray-900 mb-2">多くの日本人の英語学習には２つの特徴があります。</p>
              <div className="mb-1">
                <p className="text-gray-900"><strong>日英変換</strong>：英単語や英文を日本語に置き換えて理解する方法。多くの単語帳やフラッシュカードはこの仕組みです。</p>
              </div>

              <div className="mb-1">
                <p className="text-gray-900"><strong>文法の論理的理解</strong>：be動詞、否定文、仮定法などを段階的に学び、問題集で繰り返し練習します。</p>
              </div>

              <p className="text-gray-700">これらは試験対策には有効ですが、</p>
              <ul className="list-disc list-inside text-gray-700 space-y-1">
                <li>相手の英語が聞き取れない</li>
                <li>思考が翻訳で遅くなる</li>
                <li>言いたいことを瞬時に表現できない</li>
              </ul>
              <p className="text-gray-700">といった問題が残ることが多いです。一語一句を日本語に変換し、文法の正しさを気にしすぎてしまうのです。</p>

              <p className="text-gray-700 leading-relaxed"><strong>本質的な英語力</strong>とは、日本語と同じように意味をそのまま理解し、アイデアを直接言葉にできること。日本語の文をいちいち分解しないように、英語も自然に理解・発信できる状態が理想だと私は考えています。
                そして、学習方法もそれに合わせて変えることができれば、日本にいながらでも本質的な英語力が身につくと考えています。
              </p>
            </div>

            <div>
              <h4 className="text-2xl font-semibold mb-2">本質的な英語力を身につける３つの方法</h4>
              <div className="flex flex-col gap-6 mt-4">
                
                  <div className="p-4 bg-gray-100 rounded-lg">
                    <p className="mt-1 text-xl"><strong>1: 英単語は「英語で」学ぶ</strong></p>
                    <div className="mt-1">
                      <p>英単語を日本語訳で覚えるのではなく、<strong>英語の定義や例文と結びつけて学ぶ</strong>ことをおすすめします。これは、私たちが日本語の知らない単語を国語辞典で調べ、よりやさしい日本語で説明を理解するのと同じ仕組みです。以下のような細かい部分が分かるようになるというメリットもあります。</p>

                      <ul className="list-disc list-inside mt-2">
                        <li>どんな場面で使えるのか</li>
                        <li>どんな文で自然に使われるのか</li>
                        <li>細かなニュアンスの違いは何か</li>
                      </ul>

                      <div className="mt-2">
                        <p className="mt-1">
                          例：<strong>Perseverence</strong> (忍耐)
                        </p>
                        <p>(定義) &quot;Perseverance means keeping on and not giving up, even when something is hard or takes a long time.&quot;</p>
                        <p>(例文) &quot;She showed great perseverance by practicing the piano every day until she finally mastered the song.&quot;</p>
                        <p>(類義語) Determination, Persistence, Dedication, Endurance</p>
                        <p>(対義語) Giving up, Surrender</p>

                        <p className="mt-2">英英辞書・英英単語帳を使い、この学習方法を実践できます。</p>
                        <p className="mt-2">また、ChatGPTなどの生成AIに下のプロンプトを送信することも効果的です。</p>

                        <p className="mt-2">この学習方法を効率化するために、英単語アプリ
                         <Link
                          className="underline"
                          href="/vocabstream"
                         >
                          <strong>VocabStream</strong>
                          </Link>
                          を安定して動作する機能のみ公開しています。
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-100 rounded-lg">
                    <p className="mt-1 text-xl"><strong>2: 英語のインプットを増やす</strong></p>
                    <div className="mt-1">
                      <p>英語力を本質的に伸ばすには、やはり <strong>リアルなインプット</strong> が欠かせません。</p>
                      <p>リスニングには「日本語ですでに観たことのあるお気に入りの映画」を英語で視聴することや、英語でYoutubeなどを見ることをお勧めしています。</p>
                      <p>リーディングには「日本語で読んだことのあるお気に入りの本を英語で読む」ことをお勧めしています。ストーリーを知っている分、日本語の訳さずに、英語の音声や文と意味を結びつけやすくなります。</p>

                      <div className="mt-2">
                        <p className="font-semibold">注意点：</p>
                        <ul className="list-disc list-inside mt-1">
                          <li>日本語字幕や翻訳に頼らない（結局日英変換の学習になってしまう）</li>
                          <li>文法を過剰に分析しない（文を丸ごと意味として理解する練習に集中する）</li>
                        </ul>
                      </div>
                      <p className="mt-2">この学習方法を効率化するために、最適な英語のYoutube動画を推薦するアプリ
                         <a
                          className="underline"
                          href="https://VidMatcher.projectfluence.vercel.app"
                          target="_blank"
                          rel="noopener noreferrer"
                          >
                          <strong>VidMatcher</strong>
                          </a>
                          を開発中です。
                        </p>
                    </div>
                  </div>

                {/* ここでコピー可能な依頼文ブロックを並べる */}
                <div className="p-4 bg-gray-100 rounded-lg space-y-3">
                  <p className="mt-1 text-xl"><strong>3: AIを使ってアウトプットの練習をする</strong></p>
                  <div className="mt-1">
                    <p>アウトプットの経験を積むには、生成AIとスピーキング・ライティングを練習することがおすすめです。「いつでも・どこでも・好きなだけ」 練習できるのが最大のメリットです。</p>
                    
                    <p className="mt-2">ChatGPTなどの生成AIに下のプロンプトを送信することも効果的です。</p>
                    <p className="mt-2">この学習方法を効率化するために、レベルにあわせた会話練習を提供するアプリ
                      <a
                          className="underline"
                          href="/speakwise"
                          >
                          <strong>SpeakWiseAI</strong>
                      </a>
                        を開発中です。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Prompts Section */}
          <section id="prompts" className="mt-8 bg-white rounded-2xl p-6 shadow">
            <h2 className="text-2xl font-bold">AIプロンプト集</h2>
            <p className="mt-2 text-gray-700">
              以下のプロンプトを使うことで、AIを活用した英語学習を効果的に進めることができます。コピーして、ChatGPTなどの生成AIに送信してみてください。
            </p>

            <div className="mt-6">
              <h3 className="text-xl font-semibold mb-3">アウトプット練習</h3>
              <div className="grid gap-3">
                {prompts.map((p, i) => (
                  <CopyablePrompt key={i} label={p.label} text={p.text} />
                ))}
              </div>
            </div>

            <div className="mt-8">
              <h3 className="text-xl font-semibold mb-3">単語・文法練習</h3>
              <div className="grid gap-3">
                {prompts2.map((p, i) => (
                  <CopyablePrompt key={i} label={p.label} text={p.text} />
                ))}
              </div>
            </div>
          </section>

          <footer className="mt-10 text-sm text-gray-700">All content © {new Date().getFullYear()} 黒木 勇人
           
          </footer>
          <Link href="/privacy" target="_blank">Privacy Policy</Link>
        </div>

        {menuOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50">
          
          {/* Side panel */}
          <div className="absolute right-0 top-0 w-64 h-full bg-white shadow-lg p-6">
            
            {/* Close button */}
            <button
              onClick={() => setMenuOpen(false)}
              className="text-xl mb-6"
            >
              ✕
            </button>

            {/* Navigation */}
            <nav className="flex flex-col gap-4 text-lg">

              {/* Parent */}
              <div>
                <a href="#apps" onClick={() => setMenuOpen(false)}>
                  英語学習アプリ
                </a>

                {/* Children (indented) */}
                <div className="flex flex-col gap-2 mt-2 ml-4 text-base text-gray-600">
                  <Link
                    href="/vocabstream"
                    onClick={() => setMenuOpen(false)}
                  >
                    ・VocabStream
                  </Link>

                  <a
                    href="https://video.projectfluence.vercel.app"
                    target="_blank"
                    onClick={() => setMenuOpen(false)}
                  >
                    ・VidMatcher
                  </a>

                  <a
                    href="/speakwise"
                    onClick={() => setMenuOpen(false)}
                  >
                    ・SpeakWiseAI
                  </a>
                </div>
              </div>

              {/* Other links */}
              <a href="#notes" onClick={() => setMenuOpen(false)}>
                最近のnote記事
              </a>
              <a href="#english-motivation" onClick={() => setMenuOpen(false)}>
                英語を学ぶモチベーション
              </a>
              <a href="#method" onClick={() => setMenuOpen(false)}>
                効果的な英語学習方法
              </a>
              <a href="#prompts" onClick={() => setMenuOpen(false)}>
                AIプロンプト集
              </a>

            </nav>
          </div>
        </div>
      )}


      </main>
    </>
  );
}
