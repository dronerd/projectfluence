import React from "react";
import { useNavigate } from "react-router-dom";

export default function StillUnderDevelopment() {
  const navigate = useNavigate();

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <div className="vocab-placeholder-card">
        <h1 className="text-2xl font-bold mb-4">現在、この機能は開発中です</h1>
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => navigate(-1)}
            style={{
              padding: "12px 18px",
              borderRadius: "14px",
              background: "linear-gradient(135deg, #15335f, #28579e)",
              color: "white",
              fontWeight: "700",
              border: "none",
              cursor: "pointer",
              fontSize: "15px",
            }}
          >
            ← Go Back / 戻る
          </button>
        </div>

        <section className="mb-6" style={{ marginTop: 24 }}>
          <h2 className="text-xl font-semibold mb-2">機能について</h2>
          <p className="mb-4">
            現在、本機能は開発段階にあります。VocabStreamは安定して動作する一部の機能から順番に公開しており、
            今後もProject Fluence全体の世界観に合わせてアップデートを続けていきます。
          </p>
          <p>
            いま利用できる中心機能は、単語学習レッスンとChatGPTプロンプト集です。追加機能も順次ここに統合していきます。
          </p>
        </section>
      </div>
    </main>
  );
}
