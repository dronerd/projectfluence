import React from "react";
import { useNavigate } from "react-router-dom";

export default function StillUnderDevelopment() {
  const navigate = useNavigate();
  return (
    <main className="p-6 max-w-3xl mx-auto" style={{ paddingTop: "92px" }}>
      <h1 className="text-2xl font-bold mb-4">英検3級の画面のテストです</h1>
      
      {/* 戻るボタン */}
      <div className="mt-8 flex justify-center">
        <button
          onClick={() => navigate(-1)}
          style={{
            padding: "10px 18px",
            borderRadius: "12px",
            background: "linear-gradient(135deg, #3a8dff, #0066ff)",
            color: "white",
            fontWeight: "600",
            border: "none",
            cursor: "pointer",
            fontSize: "15px",
            boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
            transition: "transform 0.15s ease, boxShadow 0.15s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 6px 14px rgba(0,0,0,0.18)")}
          onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 4px 10px rgba(0,0,0,0.15)") }
          onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.95)")}
          onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          <strong>← Go Back / 戻る</strong>
        </button>

      </div>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">英検3級リスニング</h2>
      </section>
    </main>
  );
}