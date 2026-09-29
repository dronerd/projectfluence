"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import AuthButton from "./AuthButton";
import AppBrand from "./AppBrand";
import { learningApps, type LearningApp } from "../lib/brands";

const appKeys = Object.keys(learningApps) as LearningApp[];

export default function AppHeader() {
  const pathname = usePathname();
  const currentApp = appKeys.find((app) => pathname.startsWith(learningApps[app].href));
  return <header className="pf-header">
    <div className="pf-header-inner">
      <div className={`pf-header-branding${currentApp ? " pf-header-branding-app" : ""}`}>
        <Link href="/" className="pf-brand" aria-label="Project Fluence ホーム">
          <Image src="/images/logo.png" alt="" width={34} height={34} priority />
          <span>Project Fluence</span>
        </Link>
        {currentApp && <Link className="pf-current-app" href={learningApps[currentApp].href} aria-label={`${learningApps[currentApp].name} ホーム`}><AppBrand app={currentApp} /></Link>}
      </div>
      <nav className="pf-nav" aria-label="メインナビゲーション">
        {appKeys.map((app) => {
          const item = learningApps[app];
          return <Link key={app} href={item.href} aria-label={`${item.name} · ${item.purpose}`} aria-current={currentApp === app ? "page" : undefined}>
            <AppBrand app={app} compact /><span className="pf-nav-short">{item.short}</span>
          </Link>;
        })}
        <Link href="/analytics" aria-label="学習の記録" aria-current={pathname.startsWith("/analytics") ? "page" : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4v16h17M9 15v-4M14 15V7M19 15v-6" /></svg>
          <span className="pf-nav-full">学習の記録</span><span className="pf-nav-short">記録</span>
        </Link>
      </nav>
      <div className="pf-header-account"><AuthButton compact userMenu /></div>
    </div>
  </header>;
}
