import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

type Prompt = {
  id: string;
  title: string;
  text: string;
};

const PROMPTS: Prompt[] = [
  {
    id: "speaking",
    title: "英会話の練習用",
    text:
      "Hi, I want to practice speaking English. Please ask me some questions in the subject of (everyday life/ university studies/ future plans…etc). After I answer, give me feedback and then ask another question. Use words I know, but sometimes a few harder ones so I can learn.",
  },
  {
    id: "eiken",
    title: "英検対策（例：１級の面接）",
    text:
      "I would like to prepare for the Eiken grade 1 Speaking section. Could you please present me with a topic that is relevant to Eiken grade 1? Then I will try to give a presentation on this topic. Afterwards, you could correct my presentation and show me how I could improve it. It would also be helpful if you could later ask me a few questions about my presentation.",
  },
  {
    id: "toefl",
    title: "TOEFLライティングの練習",
    text:
      "Can you give me an example of a typical writing task given in the TOEFL iBT writing part (1/2)? I will type in my answer, so please fix grammatical mistakes, and teach me how I can further improve my vocabulary use.",
  },
  {
    id: "rewrite",
    title: "自由ライティングの添削",
    text: "Can you revise this text for me? / Can you improve this text for me?",
  },
  {
    id: "vocab",
    title: "学んだ表現のリスト化",
    text: "Can you create a list of vocabularies and phrases you taught me today that might be useful in the future?",
  },
  {
    id: "vocab_learn",
    title: "単語の説明を求める",
    text:
      "Can you give me the definition, an example sentence, synonyms, and antonyms for the word (' ')? Please use words that are easier than the word itself to explain.",
  },
  {
    id: "sentence_correction",
    title: "自作した例文の添削",
    text: "Can you correct and improve this sentence for me?",
  },
  {
    id: "level_setting",
    title: "レベルを指定する",
    text: "My English level is (A1/A2/B1/B2/C1/C2). Please use vocabulary appropriate for (A1/A2/B1/B2/C1/C2) learners.",
  },
  {
    id: "pronunciation_help",
    title: "発音を教えてほしいとき",
    text: "Please provide a phonetic transcription and tips to pronounce this sentence.",
  },
];

export default function PromptPage() {
  const nav = useNavigate();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyText = useCallback(async (text: string, id: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1400);
    } catch (e) {
      console.error("Copy failed", e);
      alert("コピーに失敗しました。ブラウザの設定を確認してください。");
    }
  }, []);

  return (
    <div className="vs-prompts">
      <style>{`
        .vs-prompts {
          max-width: 1180px;
          margin: 0 auto;
          color: #edf4ff;
        }

        .vs-prompts-hero,
        .vs-prompts-guide {
          background: linear-gradient(180deg, rgba(248,251,255,0.98), rgba(234,241,249,0.96));
          color: #10203b;
          border-radius: 28px;
          border: 1px solid rgba(154,176,208,0.2);
          box-shadow: 0 22px 60px rgba(5,13,30,0.34);
          padding: 28px;
        }

        .vs-prompts-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
          margin-top: 22px;
        }

        .vs-prompt-card {
          background: linear-gradient(180deg, rgba(15,33,61,0.98), rgba(21,43,77,0.95));
          color: #edf4ff;
          border-radius: 22px;
          padding: 20px;
          box-shadow: 0 18px 38px rgba(7,15,31,0.24);
        }

        .vs-prompt-header {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: start;
          margin-bottom: 12px;
        }

        .vs-prompts button,
        .vs-prompts a {
          font-family: inherit;
        }

        .vs-prompt-copy,
        .vs-prompts-back {
          border: none;
          border-radius: 14px;
          background: linear-gradient(135deg, #dfe9f7 0%, #c2d4ec 100%);
          color: #10203b;
          font-weight: 800;
          cursor: pointer;
          padding: 11px 15px;
        }

        .vs-prompt-text {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          color: #d3dceb;
          line-height: 1.7;
          font-size: 14px;
        }

        .vs-prompts-guide {
          margin-top: 22px;
        }

        .vs-prompts-guide h2,
        .vs-prompts-guide p,
        .vs-prompts-guide li {
          margin-top: 0;
          color: #10203b;
          line-height: 1.75;
        }

        .vs-prompts-guide a {
          color: #163d75;
          font-weight: 700;
          text-decoration: underline;
        }

        @media (max-width: 900px) {
          .vs-prompts-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .vs-prompts-hero,
          .vs-prompts-guide,
          .vs-prompt-card {
            padding: 20px;
            border-radius: 22px;
          }

          .vs-prompt-header {
            flex-direction: column;
          }
        }
      `}</style>

      <section className="vs-prompts-hero">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: "0 0 8px", color: "#21467d", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Prompt Library
            </p>
            <h1 style={{ margin: 0, fontSize: "clamp(30px, 5vw, 48px)" }}>ChatGPTのプロンプト集</h1>
            <p style={{ margin: "12px 0 0", color: "#54657e", maxWidth: 760, lineHeight: 1.75 }}>
              すぐ使える英語学習プロンプトを、VocabStreamと同じトーンで整理しました。必要なカードだけコピーして、そのままChatGPTへ貼り付けられます。
            </p>
          </div>
          <button className="vs-prompts-back" onClick={() => nav("/learn")}>
            ← 戻る
          </button>
        </div>
      </section>

      <div className="vs-prompts-grid" role="list">
        {PROMPTS.map((prompt) => (
          <article key={prompt.id} className="vs-prompt-card" role="listitem">
            <div className="vs-prompt-header">
              <strong>{prompt.title}</strong>
              <button className="vs-prompt-copy" onClick={() => copyText(prompt.text, prompt.id)}>
                {copiedId === prompt.id ? "コピー済み" : "コピーする"}
              </button>
            </div>
            <pre className="vs-prompt-text">{prompt.text}</pre>
          </article>
        ))}
      </div>

      <section className="vs-prompts-guide">
        <h2>使い方</h2>
        <p>初めて使う場合は、ChatGPTを開いてカードの文を貼り付けるだけで大丈夫です。学習レベルや目的に合わせて一部を書き換えると、さらに使いやすくなります。</p>
        <ol>
          <li><a href="https://chat.openai.com/" target="_blank" rel="noopener noreferrer">ChatGPT</a> を開く。</li>
          <li>使いたいカードの「コピーする」を押す。</li>
          <li>チャット欄へ貼り付けて送信する。</li>
          <li>必要なら CEFR レベルや試験名、練習したいテーマを追加する。</li>
        </ol>
      </section>
    </div>
  );
}
