import { useEffect, useRef } from "react";
import type { VocabStreamReviewQuestion } from "../api";
import type { LessonWord } from "../lib/learning";
import { speakEnglish } from "../pages/speech";

export function WordDetails({ word }: { word: Partial<LessonWord> }) {
  return <dl className="vs-word-details">{[["日本語", word.japaneseMeaning], ["類義語", word.synonyms], ["対義語", word.antonyms], ["語形", word.forms], ["解説", word.explanation]].filter(([, value]) => value).map(([label, value]) => <div key={label} style={{ display: "contents" }}><dt>{label}</dt><dd lang={label === "日本語" || label === "解説" ? undefined : "en"}>{value}</dd></div>)}</dl>;
}

export default function PracticeQuestion({ question, index, total, selected, onChoose, onNext, nextLabel = "次の問題へ" }: { question: VocabStreamReviewQuestion; index: number; total: number; selected: number | null; onChoose: (choice: number) => void; onNext: () => void; nextLabel?: string }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [question.id]);
  return <>
    <div className="vs-practice-topline"><span>{question.questionType === "meaning" ? "意味を選ぶ" : "例文を完成させる"}</span><span>{index + 1} / {total} 問</span></div>
    <progress className="vs-progress" max={total} value={index + (selected === null ? 0 : 1)} aria-label="問題の進み具合" />
    <h2 ref={headingRef} tabIndex={-1} className="vs-question-title" lang="en">{question.prompt}</h2>
    <p className="vs-muted">{question.questionType === "meaning" ? "この定義に合う単語を選びましょう。" : "空欄に合う単語を選びましょう。"}</p>
    <div className="vs-choices">{question.choices.map((choice, i) => {
      const correct = selected !== null && i === question.answerIndex;
      const incorrect = selected === i && !correct;
      return <button key={`${choice}-${i}`} className={`vs-choice${correct ? " is-correct" : incorrect ? " is-incorrect" : ""}`} onClick={() => onChoose(i)} disabled={selected !== null}><span className="vs-choice-number" aria-hidden="true">{i + 1}</span><span lang="en">{choice}</span>{correct && <small>✓ 正解</small>}{incorrect && <small>選択した回答</small>}</button>;
    })}</div>
    {selected !== null && <>
      <div className="vs-feedback" role="status"><strong>{selected === question.answerIndex ? "正解です！" : "次につながる一問です。"}</strong><p>{selected === question.answerIndex ? "この調子で続けましょう。" : `正解は「${question.correctAnswer}」。意味と例文を確認してみましょう。`}</p></div>
      <div className="vs-actions"><button className="pf-button" onClick={onNext}>{nextLabel}<span aria-hidden="true">→</span></button><button className="pf-button-secondary" onClick={() => speakEnglish(`${question.word}. ${question.example || ""}`)}>音声を聞く</button></div>
      <details className="vs-details"><summary>意味・例文を確認</summary><p lang="en">{question.definition}</p>{question.example && <p className="vs-example" lang="en">{question.example}</p>}<WordDetails word={question} /></details>
    </>}
  </>;
}
