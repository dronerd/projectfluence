import AppHeader from "@/app/components/AppHeader";
import AppBrand from "@/app/components/AppBrand";
import { Link } from "../lib/router-compat";

export default function Header({ currentPath = "/" }: { currentPath?: string; title?: string; isLoginPage?: boolean }) {
  return <>
    <AppHeader />
    <nav className="vs-subnav" aria-label="VocabStream メニュー">
      <div className="vs-subnav-inner">
        <AppBrand app="vocabstream" compact className="vs-product-name" />
        <div className="vs-tabs">
          <Link to="/learn" aria-current={!['/review', '/weak-words'].includes(currentPath) ? 'page' : undefined}>レッスン</Link>
          <Link to="/review" aria-current={currentPath === '/review' ? 'page' : undefined}>復習</Link>
          <Link to="/weak-words" aria-current={currentPath === '/weak-words' ? 'page' : undefined}>復習する単語</Link>
        </div>
      </div>
    </nav>
  </>;
}
