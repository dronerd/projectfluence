import Image from "next/image";
export default function Loading() {
  return <><header className="pf-header" aria-hidden="true"><div className="pf-header-inner"><span className="pf-brand"><Image src="/images/logo.png" alt="" width={34} height={34} /><span>Project Fluence</span></span></div></header><main id="main-content" tabIndex={-1} className="pf-page" aria-busy="true"><div className="pf-panel mx-auto max-w-xl p-8" role="status"><h1 className="text-xl font-bold">学習の準備をしています</h1><p className="mt-3 text-sm text-slate-600">しばらくお待ちください…</p></div></main></>;
}
