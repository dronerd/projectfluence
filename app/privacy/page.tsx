"use client";

import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Privacy Policy / プライバシーポリシー</h1>

      {/* 英語版 */}
      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">English</h2>
        <p className="mb-4">
          This website uses Vercel Analytics to collect anonymous traffic data.
          The information collected includes general usage statistics such as
          page views, device type, and region. No personally identifiable
          information is stored or shared.
        </p>
        <p>
          The purpose of this data collection is to improve the performance and
          usability of the site. By using this website, you agree to this basic
          collection of anonymous analytics data.
        </p>
      </section>

      {/* 日本語版 */}
      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">日本語</h2>
        <p className="mb-4">
          当サイトは、Vercel Analytics を利用して匿名のアクセスデータを収集しています。
          収集される情報には、ページ閲覧数、デバイスタイプ、地域などの一般的な利用状況が含まれます。
          個人を特定できる情報は保存・共有されません。
        </p>
        <p>
          これらのデータ収集の目的は、サイトのパフォーマンスと利便性を向上させるためです。
          本サイトを利用することで、この匿名分析データの基本的な収集に同意したものとみなされます。
        </p>
      </section>

      {/* 戻るリンク */}
      <div className="mt-8">
        <Link
          href="/"
          className="text-blue-600 hover:underline font-medium"
        >
          ← Back to Home / ホームに戻る
        </Link>
      </div>
    </main>
  );
}
