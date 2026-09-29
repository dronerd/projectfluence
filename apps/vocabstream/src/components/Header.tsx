import AppHeader from "@/app/components/AppHeader";
import { Link } from "../lib/router-compat";

export default function Header({ currentPath = "/" }: { currentPath?: string; title?: string; isLoginPage?: boolean }) {
  return <>
    <AppHeader />
    <nav className="vs-subnav" aria-label="VocabStream メニュー">
      <div className="vs-subnav-inner">
        <span className="vs-product-name">VocabStream</span>
        <div className="vs-tabs">
          <Link to="/learn" aria-current={!['/review', '/weak-words'].includes(currentPath) ? 'page' : undefined}>レッスン</Link>
          <Link to="/review" aria-current={currentPath === '/review' ? 'page' : undefined}>復習</Link>
          <Link to="/weak-words" aria-current={currentPath === '/weak-words' ? 'page' : undefined}>復習する単語</Link>
        </div>
      </div>
    </nav>
  </>;
}
