
import "./globals.css";
import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "Project Fluence | AI English Learning Platform",
  description: "Project Fluenceは、AIアプリが連携して学習体験を最適化する英語学習プラットフォームです。",

  icons: {
    icon: "/favicon.ico",
    apple: "/icon.png",       // iOS Safari 対応（任意だが推奨）
  },

  openGraph: {
    title: "Project Fluence",
    description: "AI英語学習プラットフォーム",
    images: ["https://projectfluence.vercel.app/images/logo_full.png"],
  },

  twitter: {
    card: "summary_large_image",
    title: "Project Fluence",
    description: "AI英語学習プラットフォーム",
    images: ["https://projectfluence.vercel.app/images/logo_full.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
