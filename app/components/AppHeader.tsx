"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import AuthButton from "./AuthButton";

const destinations = [
  { href: "/vocabstream", label: "単語を学ぶ", short: "単語", icon: "book" },
  { href: "/speakwise", label: "会話を練習", short: "会話", icon: "chat" },
  { href: "/vidmatch", label: "動画で学ぶ", short: "動画", icon: "play" },
  { href: "/analytics", label: "学習の記録", short: "記録", icon: "chart" },
];
function NavIcon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "book" ? <><path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z" /></> : name === "chat" ? <path d="M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0ZM7 10h8M7 14h5" /> : name === "play" ? <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m10 8 6 4-6 4Z" /></> : <><path d="M4 4v16h17M9 15v-4M14 15V7M19 15v-6" /></>}
  </svg>;
}
export default function AppHeader() {
  const pathname = usePathname();
  return <header className="pf-header">
    <div className="pf-header-inner">
      <Link href="/" className="pf-brand" aria-label="Project Fluence ホーム">
        <Image src="/images/logo.png" alt="" width={34} height={34} priority />
        <span>Project Fluence</span>
      </Link>
      <nav className="pf-nav" aria-label="メインナビゲーション">
        {destinations.map((item) => <Link key={item.href} href={item.href} aria-current={pathname.startsWith(item.href) ? "page" : undefined}>
          <NavIcon name={item.icon} /><span className="pf-nav-full">{item.label}</span><span className="pf-nav-short">{item.short}</span>
        </Link>)}
      </nav>
      <div className="pf-header-account"><AuthButton compact userMenu /></div>
    </div>
  </header>;
}
