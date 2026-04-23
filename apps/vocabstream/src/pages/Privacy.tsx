import React from "react";
import { useNavigate } from "react-router-dom";

export default function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <div className="vocab-placeholder-card">
        <h1 className="text-2xl font-bold mb-4">Privacy Policy / プライバシーポリシー</h1>
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
          <h2 className="text-xl font-semibold mb-2">English</h2>
          <p className="mb-4">
            This website uses Vercel Analytics to collect anonymous traffic data. The information collected includes general
            usage statistics such as page views, device type, and region. No personally identifiable information is stored or shared.
          </p>
          <p>
            The purpose of this data collection is to improve the performance and usability of the site. By using this website,
            you agree to this basic collection of anonymous analytics data.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-xl font-semibold mb-2">日本語</h2>
          <p className="mb-4">
            当サイトは、Vercel Analytics を利用して匿名のアクセスデータを収集しています。収集される情報には、ページ閲覧数、デバイスタイプ、
            地域などの一般的な利用状況が含まれます。個人を特定できる情報は保存・共有されません。
          </p>
          <p>
            これらのデータ収集の目的は、サイトのパフォーマンスと利便性を向上させるためです。本サイトを利用することで、
            この匿名分析データの基本的な収集に同意したものとみなされます。
          </p>
        </section>
      </div>
    </main>
  );
}
