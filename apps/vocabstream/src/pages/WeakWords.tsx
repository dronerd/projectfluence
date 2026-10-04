import { Link } from "../lib/router-compat";
import { useReviewData } from "../lib/useReviewData";
import { courseLabel, lessonLabel } from "../lib/catalog";
import { WordDetails } from "../components/PracticeQuestion";
import VocabularyImage from "../components/VocabularyImage";
import { validWordImage } from "../lib/questionPolicy";
import ReviewState from "../components/ReviewState";
import { speakVocabulary } from "./speech";

export default function WeakWords() {
  const { weakWords, loading, signedIn, error, refresh } = useReviewData();
  const ready = !loading && signedIn && !error && weakWords.length > 0;
  return <div className="vs-page">
    <header className="vs-page-heading"><p className="pf-eyebrow">YOUR VOCABULARY</p><h1>復習する単語</h1></header>
    <ReviewState loading={loading} signedIn={signedIn} error={error} empty={!weakWords.length} onRetry={refresh} />
    {ready && <><section className="vs-start-strip"><div><h2>{weakWords.length} 語を復習リストに保存</h2><p>よく間違えた単語から表示しています。クイズでもう一度練習できます。</p></div><Link className="pf-button" to="/review">復習を始める <span aria-hidden="true">→</span></Link></section><p className="vs-muted">英語の読み上げ音声はAIで生成したもので、人の録音ではありません。</p>
      <div className="vs-weak-grid">{weakWords.map((word) => <article key={`${word.sourceCategory}-${word.word}`} className="vs-weak-card"><p className="vs-muted">{courseLabel(word.sourceCategory)}{word.sourceLessonNumber ? ` · ${lessonLabel(word.sourceCategory, word.sourceLessonNumber)}` : ""}</p><h2 lang="en">{word.word}</h2>{validWordImage(word.image) && <VocabularyImage image={word.image!} loading="lazy" />}<p lang="en">{word.definition}</p>{word.example && <blockquote className="vs-example" lang="en">{word.example}</blockquote>}<button className="pf-button-secondary" onClick={() => speakVocabulary(word.word, word.example)}>音声を聞く</button><details className="vs-details"><summary>日本語訳・関連語を見る</summary><WordDetails word={word} /><p className="vs-muted">これまでに {word.mistakeCount} 回、復習の対象になりました。</p></details></article>)}</div></>}
  </div>;
}
