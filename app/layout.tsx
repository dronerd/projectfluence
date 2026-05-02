
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Project Fluence",
  description: "AIアプリが連携して学習体験を最適化する、英語学習のエコシステム",

  icons: {
    icon: "/favicon.ico",
    apple: "/icon.png",       // iOS Safari 対応（任意だが推奨）
  },

  openGraph: {
    images: ["https://projectfluence.vercel.app/images/logo_full.png"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["https://projectfluence.vercel.app/images/logo_full.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
