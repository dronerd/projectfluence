import { useEffect, useRef } from "react";
import type { VocabStreamReviewQuestion } from "../api";
import type { LessonWord } from "../lib/learning";
import { getCourse } from "../lib/catalog";
import { Link } from "../lib/router-compat";
import { speakEnglish } from "../pages/speech";
import VocabularyImage from "./VocabularyImage";
import { validWordImage } from "../lib/questionPolicy";

export function focusLearningHeading(heading: HTMLElement | null) {
  if (!heading) return;
  heading.focus({ preventScroll: true });
  const headerHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--pf-header-height")) || 0;
  const rect = heading.getBoundingClientRect();
  if (rect.top < headerHeight + 8 || rect.bottom > window.innerHeight - 24) {
    heading.scrollIntoView({ block: "start", behavior: "auto" });
  }
}

export function WordDetails({ word }: { word: Partial<LessonWord> }) {
  const expressionLabel = word.expressionType && { "phrasal-verb": "句動詞", collocation: "よく使う語の組み合わせ", "fixed-expression": "定型表現", idiom: "慣用表現" }[word.expressionType];
  const original = word.duplicateOf;
  const course = original && getCourse(original.category);
  const originalLesson = original && course && Number.isInteger(original.lessonNumber) && original.lessonNumber > 0 && original.lessonNumber <= course.lessons ? `/lesson/${original.category}-lesson-${original.lessonNumber}` : undefined;
  return <dl className="vs-word-details">{[["日本語", word.japaneseMeaning], ["表現の種類", expressionLabel], ["類義語", word.synonyms], ["対義語", word.antonyms], ["語形", word.forms], ["解説", word.explanation], ["使い方", word.usageNote]].filter(([, value]) => value).map(([label, value]) => <div key={label} style={{ display: "contents" }}><dt>{label}</dt><dd lang={["類義語", "対義語", "語形"].includes(label || "") ? "en" : undefined}>{value}</dd></div>)}{originalLesson && <><dt>既習語の復習</dt><dd><Link to={originalLesson}>最初に学ぶレッスンを確認</Link></dd></>}</dl>;
}

export default function PracticeQuestion({ question, index, total, selected, onChoose, onNext, nextLabel = "次の問題へ" }: { question: VocabStreamReviewQuestion; index: number; total: number; selected: number | null; onChoose: (choice: number) => void; onNext: () => void; nextLabel?: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const image = validWordImage(question.image);
  const imagePrompt = question.promptMode === "image" && image;
  useEffect(() => { focusLearningHeading(headingRef.current); }, [question.id]);
  return <>
    <div className="vs-practice-topline">{!imagePrompt && <span>{question.questionType === "meaning" ? "意味に合う単語を選ぶ" : question.promptMode === "example" ? "例文の意味を選ぶ" : "例文を完成させる"}</span>}<span className="vs-practice-count">{index + 1} / {total} 問</span></div>
    <progress className="vs-progress" max={total} value={index + (selected === null ? 0 : 1)} aria-label="問題の進み具合" />
    <h2 ref={headingRef} tabIndex={-1} className="vs-question-title" lang={imagePrompt || question.promptMode === "example" ? "ja" : "en"}>{imagePrompt ? "画像に合う英単語を選んでください。" : question.promptMode === "example" ? <>例文の「<span lang="en">{question.word}</span>」の意味を選んでください。</> : question.prompt}</h2>
    {question.promptMode === "example" && <blockquote className="vs-example" lang="en">{question.prompt}</blockquote>}
    {imagePrompt && <VocabularyImage image={imagePrompt} />}
    <div className="vs-choices">{question.choices.map((choice, i) => {
      const correct = selected !== null && i === question.answerIndex;
      const incorrect = selected === i && !correct;
      return <button key={`${choice}-${i}`} className={`vs-choice${correct ? " is-correct" : incorrect ? " is-incorrect" : ""}`} onClick={() => onChoose(i)} disabled={selected !== null}><span className="vs-choice-number" aria-hidden="true">{i + 1}</span><span lang={question.promptMode === "example" ? "ja" : "en"}>{choice}</span>{correct && <small>✓ 正解</small>}{incorrect && <small>選択した回答</small>}</button>;
    })}</div>
    {selected !== null && <div className="vs-answer-result">
      <div className="vs-feedback vs-answer-feedback" role="status"><strong>{selected === question.answerIndex ? "正解です！" : <>正解は <span lang={question.promptMode === "example" ? "ja" : "en"}>{question.correctAnswer}</span> です。</>}</strong></div>
      {image && !imagePrompt && <VocabularyImage image={image} />}
      <div className="vs-actions vs-answer-actions"><button className="pf-button" onClick={onNext}>{nextLabel}<span aria-hidden="true">→</span></button><button className="pf-button-secondary" onClick={() => speakEnglish(`${question.word}. ${question.example || ""}`)}>音声を聞く</button></div>
      <details className="vs-details"><summary>意味・例文を確認</summary><p lang="en">{question.definition}</p>{question.example && <p className="vs-example" lang="en">{question.example}</p>}<WordDetails word={question} /></details>
    </div>}
  </>;
}
