import React from "react";
import { useNavigate } from "react-router-dom";

export default function StillUnderDevelopment() {
  const navigate = useNavigate();
  return (
    <main className="p-6 max-w-3xl mx-auto">
      <div className="vocab-placeholder-card">
        <h1 className="text-2xl font-bold mb-4">復習レッスン</h1>
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
            ← 戻る / Go Back
          </button>
        </div>
      </div>
    </main>
  );
}
