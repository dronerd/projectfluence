import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiGetVocabStreamReview, type VocabStreamWeakWord } from "../api";
import { useAuth } from "../AuthContext";

export default function WeakWords() {
  const nav = useNavigate();
  const { token } = useAuth();
  const [weakWords, setWeakWords] = useState<VocabStreamWeakWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setLoading(false);
      setError("苦手な単語を見るにはログインが必要です。");
      return;
    }

    setLoading(true);
    apiGetVocabStreamReview(token)
      .then((data) => {
        if (cancelled) return;
        setWeakWords(data.weakWords ?? []);
        setError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "苦手な単語の読み込みに失敗しました。");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  function weakWordBackground(mistakeCount: number) {
    const maxCount = Math.max(1, ...weakWords.map((word) => word.mistakeCount));
    const ratio = Math.min(1, Math.max(0.15, mistakeCount / maxCount));
    const alpha = 0.16 + ratio * 0.42;
    return `linear-gradient(135deg, rgba(251, 146, 60, ${alpha}) 0%, rgba(239, 68, 68, ${alpha}) 100%)`;
  }

  return (
    <div className="weak-page">
      <style>{`
        .weak-page {
          min-height: 100vh;
          background: #e5e5e5;
          color: #10203b;
          padding: 20px 16px;
        }

        .weak-container {
          max-width: 1180px;
          margin: 0 auto;
        }

        .weak-list-section {
          padding: 22px;
          background: #ffffff;
          border: 1px solid rgba(209, 213, 219, 0.8);
          border-radius: 16px;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
        }

        .weak-list-heading,
        .weak-word-topline {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .weak-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .weak-button {
          border: none;
          border-radius: 999px;
          cursor: pointer;
          font-weight: 900;
          line-height: 1.2;
          padding: 11px 16px;
          color: #12366d;
          background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 45%, #cffafe 100%);
          box-shadow: 0 10px 20px rgba(29, 78, 216, 0.14);
        }

        .weak-word-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 12px;
          margin-top: 16px;
        }

        .weak-word-card {
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 16px;
          padding: 15px;
          color: #10203b;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
        }

        .weak-word-card strong {
          font-size: 20px;
          color: #0f2f5f;
        }

        .weak-word-card span {
          color: #7c2d12;
          font-weight: 900;
          white-space: nowrap;
        }

        .weak-word-card p {
          margin: 10px 0 0;
          color: #1f2937;
          line-height: 1.55;
        }

        .weak-word-card .weak-example {
          color: #475569;
          font-style: italic;
        }

        .weak-word-card small {
          display: block;
          margin-top: 10px;
          color: #475569;
          font-weight: 800;
        }

        @media (max-width: 720px) {
          .weak-list-section { padding: 18px; }
          .weak-list-heading { align-items: flex-start; flex-direction: column; }
          .weak-actions, .weak-button { width: 100%; }
          .weak-word-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="weak-container">
        <section className="weak-list-section" aria-labelledby="weak-list-title">
          <div className="weak-list-heading">
            <div>
              <h2 id="weak-list-title" style={{ fontSize: 28, fontWeight: 900, margin: 0, color: "#173a71" }}>
                苦手な単語
              </h2>
              <p style={{ color: "#475569", lineHeight: 1.7, margin: "8px 0 0" }}>
                間違えた回数が多い単語ほど、色が強く表示されます。
              </p>
            </div>
            <div className="weak-actions">
              <button className="weak-button" onClick={() => nav("/review")}>
                復習する
              </button>
              <button className="weak-button" onClick={() => nav("/learn")}>
                ジャンル一覧に戻る
              </button>
            </div>
          </div>

          {loading ? (
            <p style={{ color: "#475569" }}>苦手な単語を読み込み中...</p>
          ) : error ? (
            <p style={{ color: "#b45309", fontWeight: 700 }}>{error}</p>
          ) : weakWords.length === 0 ? (
            <p style={{ color: "#475569", lineHeight: 1.7 }}>
              まだ苦手な単語はありません。通常レッスンで間違えた単語があると、ここに復習用のリストが表示されます。
            </p>
          ) : (
            <div className="weak-word-grid">
              {weakWords.map((word) => (
                <article
                  key={`${word.sourceCategory}-${word.word}`}
                  className="weak-word-card"
                  style={{ background: weakWordBackground(word.mistakeCount) }}
                >
                  <div className="weak-word-topline">
                    <strong>{word.word}</strong>
                    <span>{word.mistakeCount}回</span>
                  </div>
                  <p>{word.definition || "定義なし"}</p>
                  {word.japaneseMeaning && <p>日本語: {word.japaneseMeaning}</p>}
                  {word.example && <p className="weak-example">{word.example}</p>}
                  {word.synonyms && <p>類義語: {word.synonyms}</p>}
                  {word.antonyms && <p>対義語: {word.antonyms}</p>}
                  {word.forms && <p>語形: {word.forms}</p>}
                  {word.explanation && <p>{word.explanation}</p>}
                  <small>{word.sourceCategory}{word.sourceLessonNumber ? ` / Lesson ${word.sourceLessonNumber}` : ""}</small>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
