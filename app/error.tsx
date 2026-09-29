"use client";
import Link from "next/link";
import AppHeader from "./components/AppHeader";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <><AppHeader /><main id="main-content" tabIndex={-1} className="pf-page"><section className="pf-panel mx-auto mt-6 max-w-xl p-6 sm:p-10" role="alert"><p className="pf-eyebrow">もう一度お試しください</p><h1 className="mt-3 text-2xl font-bold">ページを表示できませんでした</h1><p className="mt-4 text-sm text-slate-600">通信状況を確認して、もう一度読み込んでください。</p><div className="mt-6 flex flex-wrap gap-3"><button className="pf-button" onClick={reset}>もう一度読み込む</button><Link className="pf-button-secondary" href="/">ホームに戻る</Link></div></section></main></>;
}
