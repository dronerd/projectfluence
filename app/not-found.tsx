import Link from "next/link";
import AppHeader from "./components/AppHeader";
export default function NotFound() {
  return <><AppHeader /><main id="main-content" tabIndex={-1} className="pf-page"><section className="pf-panel mx-auto mt-6 max-w-xl p-6 sm:p-10"><p className="pf-eyebrow">404</p><h1 className="mt-3 text-2xl font-bold">ページが見つかりませんでした</h1><p className="mt-4 text-sm text-slate-600">リンクが変更された可能性があります。ホームから学習を続けましょう。</p><Link className="pf-button mt-6" href="/">ホームに戻る</Link></section></main></>;
}
