"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
  // --- Copyable prompt helper component ---
  function CopyablePrompt({ label, text }: { label?: string; text: string }) {
    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState("");

    async function handleCopy() {
      setCopyError("");
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
          if (!document.execCommand("copy")) throw new Error("Copy failed");
          ta.remove();
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch (innerErr) {
          console.error("Fallback copy failed:", innerErr);
          setCopyError("コピーできませんでした。テキストを選択してコピーしてください。");
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
            aria-label={`プロンプトをコピー${label ? `: ${label}` : ''}`}>
            <span aria-live="polite">{copied ? "コピーしました" : "コピー"}</span>
          </button>
          {copyError && <p role="status" className="text-sm text-amber-800">{copyError}</p>}
        </div>
      </div>
    );
  }

  // --- The prompts to show / copy ---
  const prompts = [
    {
      label: "レベルに合わせた英会話練習",
      text:
  `Be my patient English conversation partner. My level is [英語レベル（A1〜C2、わからなければ unsure）]. I want to talk about [話したいテーマ], and my goal is [例：もっとスムーズに話す／旅行に備える]. If my level is "unsure," start with an easy question and adjust as we go.

Ask one open question in English, then wait for my answer. After each answer:
1. Respond naturally to what I said, as a real conversation partner would.
2. Correct at most two mistakes that most affect meaning or naturalness. Quote my wording, explain the change briefly, and show a version I could say aloud.
3. Teach one useful phrase at my level and ask me to use it in my next answer.
4. Ask one related follow-up question. Do not answer it for me.

Keep the conversation mostly in English. Use short Japanese explanations only if I ask. After five exchanges, summarize my strengths, recurring mistakes, and one specific thing to practice next.`
    },
    {
      label: "英検1級の面接練習",
      text:
  `Help me practice the Eiken Grade 1 speaking interview. Run a practice round inspired by its topic-card, two-minute speech, and follow-up Q&A format. This is practice, not an official exam or score.

First, give me five distinct social-issue topics in English and ask me to choose one. Once I choose, tell me to take one minute to plan a position, two reasons, and an example. Wait for me to say "ready"; do not claim to time me. Then invite me to give a speech of about two minutes by voice or text. Do not write a model speech before I try.

After my speech, ask three challenging follow-up questions, one at a time, and wait for each answer. When the Q&A is over, give feedback under these headings: argument and organization, clarity of English, useful corrections, and a stronger version of one short passage. End with a reusable outline for my next attempt. If I type my answers, say that you cannot judge pronunciation from text.`
    },
    {
      label: "TOEFLライティングの練習",
      text:
  `Help me practice a TOEFL iBT-style "Write for an Academic Discussion" task. Create an original classroom question on [希望するテーマ。指定しない場合はおまかせ], plus two short student viewpoints that disagree in a reasonable way. Then ask me to write my own contribution. Wait for my response before giving examples or feedback.

After I reply:
1. State my main point in one sentence and identify any idea I have not supported well.
2. Give specific feedback on relevance, development, organization, grammar, and word choice. Quote short parts of my writing so I can see what you mean.
3. Show a minimally corrected version that keeps my ideas and voice. Then show one stronger paragraph and explain why it works better.
4. Give me two targeted revision tasks and let me try again before showing a full model response.

Do not present a score as official TOEFL scoring. If you do not know the current exam rules, do not invent them.`
    },
    {
      label: "自由ライティングの添削",
      text:
  `Act as an English writing coach. I am writing a [メール／エッセイ／SNS投稿など] for [想定する読者]. My goal is [読者に伝えたいこと・取ってほしい行動], and I want a [親しみやすい／中立／フォーマル] tone.

Here is my draft:
[ここに英文を貼り付ける]

First, tell me whether the message is clear and fits the audience. Then provide:
1. A lightly edited version that keeps my meaning and voice.
2. A more fluent alternative only where it genuinely improves the text.
3. A short table with up to five important changes: my wording, your wording, and the reason.
4. Two patterns I should watch for next time and one brief rewrite exercise based on my own sentences.

Flag any sentence whose meaning is unclear instead of guessing what I intended. If my draft is missing, ask me to paste it.`
    },
    {
      label: "学んだ表現のリスト化",
      text:
  `Help me review useful English from our conversation or from the notes below. My level is [自分の英語レベル], and I want expressions I can use in [使いたい場面].

Notes or conversation:
[学習メモを貼り付ける。会話履歴が見える場合は省略可]

Select up to eight practical words or phrases that actually appeared in the material. For each, give a simple English meaning, one natural example for my situation, a common collocation or usage note, and a short recall question. Separate expressions I used well from ones I could improve. Then quiz me on three of them, one question at a time, and wait for my answer before showing the answer.

If you cannot see the conversation and I have not pasted notes, ask me for them. Do not invent things I supposedly said.`
    }
  ];

  const prompts2 = [
    {
      label: "単語の説明を求める",
      text:
  `Teach me the English word or phrase [調べたい単語・表現]. My level is [自分の英語レベル]. I found it in this sentence or situation: [使われていた英文や場面。なければ空欄].

Explain its meaning in simpler English first. Then give its part of speech, two natural example sentences in different situations, three common collocations, and one nearby word it is often confused with. Explain the difference using short examples. Include pronunciation help only if you are confident; otherwise skip it. If the word has several meanings, focus on the meaning in my context and briefly mention the others.

Finish with one fill-in-the-blank question and one question that makes me use the word in my own sentence. Wait for my answers before giving corrections. If I have not supplied a word, ask for it.`
    },
    {
      label: "自作した例文の添削",
      text:
  `Check this English sentence I wrote: [自分が書いた英文]. I want to express: [伝えたい意味や使用場面]. My level is [自分の英語レベル].

Tell me first whether the sentence is understandable and whether it sounds natural in that situation. Give a minimally corrected version, then one more natural alternative if useful. Explain each important change in plain English, especially word choice, grammar, and register. If my intended meaning is unclear, ask one clarifying question before rewriting.

Finally, give me a similar Japanese or English cue so I can write a new sentence using the same pattern. Wait for my attempt, then correct it. If I have not supplied a sentence, ask for one.`
    },
    {
      label: "文法の弱点を見つけて練習",
      text:
  `Be my English grammar coach. My level is [自分の英語レベル]. Here are three to five sentences I wrote:
[自分で書いた英文を３〜５文貼り付ける]

Find the one recurring grammar issue that most affects clarity. Show the exact places where it occurs, explain the rule in simple English with one correct and one incorrect example, and distinguish a real error from an acceptable style choice. Correct only the relevant parts of my sentences so I can compare them.

Then create three short practice items that get a little harder. Ask them one at a time, wait for my answer, and explain why it is right or wrong before moving on. End by asking me to write one original sentence using the pattern. If there is no clear recurring issue, say so and choose one useful point instead. If I have not supplied sentences, ask for them.`
    }
  ];

  const inputPrompts = [
    {
      label: "英文を深く読む練習",
      text:
  `Help me understand an English passage without translating every sentence into Japanese. My level is [自分の英語レベル]. Here is the passage:
[短い英文を貼り付ける]

First, ask me for a one-sentence summary in English and wait for my answer. Then ask three comprehension questions, one at a time: one about the main idea, one about a detail, and one that requires an inference. After I answer each, point to the words in the passage that support or challenge my answer. Explain up to five useful phrases in simpler English and show how they work in context. Give a Japanese explanation only if I request it.

At the end, ask me to summarize the passage again in my own words and give feedback on how my understanding improved. If I have not pasted a passage, ask for one; do not make up facts about an unseen text.`
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


export default function LearningResources(){ return <div className="home-resources">          {/* Recent notes - updated: show 3 stylish rectangular cards */}
          <section id="notes" className="home-resource"><details><summary>学習コラムを読む<span aria-hidden="true">＋</span></summary><div className="home-resource-content">
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
          </div></details></section>

          {/* なぜ英語を学ぶのか */}
          <section id="english-motivation" className="home-resource"><details><summary>英語を学ぶモチベーション<span aria-hidden="true">＋</span></summary><div className="home-resource-content">
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
          </div></details></section>

          <section id="method" className="home-resource"><details><summary>効果的な英語学習方法<span aria-hidden="true">＋</span></summary><div className="home-resource-content">
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
                          例：<strong>Perseverance</strong> (忍耐)
                        </p>
                        <p>(定義) &quot;Perseverance means keeping on and not giving up, even when something is hard or takes a long time.&quot;</p>
                        <p>(例文) &quot;She showed great perseverance by practicing the piano every day until she finally mastered the song.&quot;</p>
                        <p>(類義語) Determination, Persistence, Dedication, Endurance</p>
                        <p>(対義語) Giving up, Surrender</p>

                        <p className="mt-2">英英辞書・英英単語帳を使い、この学習方法を実践できます。</p>
                        <p className="mt-2">この学習方法を効率化するために、英単語アプリ
                         <Link
                          className="underline"
                          href="/vocabstream"
                         >
                          <strong>VocabStream</strong>
                          </Link>
                          を公開しています。
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-100 rounded-lg">
                    <p className="mt-1 text-xl"><strong>2: 英語のインプットを増やす</strong></p>
                    <div className="mt-1">
                      <p>英語力を本質的に伸ばすには、やはり <strong>リアルなインプット</strong> が欠かせません。</p>
                      <p>リスニングには「日本語ですでに観たことのあるお気に入りの映画」を英語で視聴することや、英語でYoutubeなどを見ることをお勧めしています。</p>
                      <p>リーディングには「日本語で読んだことのあるお気に入りの本を英語で読む」ことをお勧めしています。ストーリーを知っている分、日本語に訳さずに、英語の音声や文と意味を結びつけやすくなります。</p>

                      <div className="mt-2">
                        <p className="font-semibold">注意点：</p>
                        <ul className="list-disc list-inside mt-1">
                          <li>日本語字幕や翻訳に頼らない（結局日英変換の学習になってしまう）</li>
                          <li>文法を過剰に分析しない（文を丸ごと意味として理解する練習に集中する）</li>
                        </ul>
                      </div>
                      <p className="mt-2">この学習方法を効率化するために、最適な英語のYoutube動画を推薦するアプリ
                         <Link
                          className="underline"
                          href="/vidmatch"
                          >
                          <strong>VidMatch</strong>
                          </Link>
                          で実践できます。
                        </p>
                    </div>
                  </div>

                {/* ここでコピー可能な依頼文ブロックを並べる */}
                <div className="p-4 bg-gray-100 rounded-lg space-y-3">
                  <p className="mt-1 text-xl"><strong>3: AIを使ってアウトプットの練習をする</strong></p>
                  <div className="mt-1">
                    <p>アウトプットの経験を積むには、生成AIとスピーキング・ライティングを練習することがおすすめです。「いつでも・どこでも・好きなだけ」 練習できるのが最大のメリットです。</p>

                    <p className="mt-2">この学習方法を効率化するために、レベルにあわせた会話練習を提供するアプリ
                      <Link
                          className="underline"
                          href="/speakwise"
                          >
                          <strong>SpeakWiseAI</strong>
                      </Link>
                        で実践できます。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div></details></section>

          {/* Prompts Section */}
          <section id="prompts" className="home-resource"><details><summary>AIプロンプト集を使う<span aria-hidden="true">＋</span></summary><div className="home-resource-content">
            <h2 className="text-2xl font-bold">AIプロンプト集</h2>
            <p className="mt-2 text-gray-700">
              以下のプロンプトをコピーして、ChatGPTなどの生成AIに送信してみてください。「[ ]」内はご自身のレベルや学習内容に置き換えて使えます。
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

            <div className="mt-8">
              <h3 className="text-xl font-semibold mb-3">インプット練習</h3>
              <div className="grid gap-3">
                {inputPrompts.map((p, i) => (
                  <CopyablePrompt key={i} label={p.label} text={p.text} />
                ))}
              </div>
            </div>
          </div></details></section>

</div>; }
