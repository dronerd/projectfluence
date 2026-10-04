import { useRef, useState } from "react";
import { allCourses, courseLabel, courseLessonNumbers, getCourse, lessonLabel } from "@/apps/vocabstream/src/lib/catalog";
import { jsonRequest, type LearningRequest, type ReadingScript, type VocabularyLesson } from "../lib/learning";

type Props = {
  request: LearningRequest; sessionId: string | null; level: string;
  run: (label: string, task: () => Promise<void>) => Promise<boolean>;
  selected: ReadingScript | null; onSelect: (script: ReadingScript) => void;
  onAsk: (text: string) => void;
  onPractice: (word: string, lesson: { category: string; lessonNumber: number }) => void;
};

export default function VocabularyLessonPicker({ request, sessionId, level, run, selected, onSelect, onAsk, onPractice }: Props) {
  const [category, setCategory] = useState(() => level.startsWith("A") ? "word-beginner" : level === "B1" ? "word-intermediate" : level === "B2" ? "word-advanced" : "word-proficiency");
  const [lessonNumber, setLessonNumber] = useState(1);
  const [preview, setPreview] = useState<VocabularyLesson | null>(null);
  const selectionRequest = useRef<{ key: string; id: string } | null>(null);
  const course = getCourse(category)!;
  const selectedLesson = selected?.settings;
  const selectedWords = selected?.vocabulary?.filter((word): word is { word: string; definition?: string; example?: string } => typeof word !== "string") || [];

  async function select(lesson: VocabularyLesson) {
    const key = `${sessionId}:${lesson.category}:${lesson.lessonNumber}`;
    if (selectionRequest.current?.key !== key) selectionRequest.current = { key, id: crypto.randomUUID() };
    const data = await request<{ script: ReadingScript }>("/api/speakwise/learning", jsonRequest({ action: "select_vocabulary_lesson", sessionId,
      category: lesson.category, lessonNumber: lesson.lessonNumber, requestId: selectionRequest.current.id }));
    onSelect(data.script); setPreview(null);
  }

  return <div className="sw-vocabulary-picker">
    <h3>VocabStreamのレッスンを選ぶ</h3>
    <p className="sw-note">単語・意味・例文を、この会話で一緒に復習できます。</p>
    <label className="sw-label" htmlFor="sw-vocab-course">コース</label>
    <select id="sw-vocab-course" className="sw-select" value={category} onChange={event => {
      setCategory(event.target.value); setLessonNumber(getCourse(event.target.value)?.firstLesson || 1); setPreview(null);
    }}>{allCourses.map(item => <option key={item.id} value={item.id}>{courseLabel(item.id)}</option>)}</select>
    <label className="sw-label" htmlFor="sw-vocab-lesson">レッスン</label>
    <div className="sw-inline-form">
      <select id="sw-vocab-lesson" className="sw-select" value={lessonNumber} onChange={event => { setLessonNumber(Number(event.target.value)); setPreview(null); }}>
        {courseLessonNumbers(course).map(number => <option key={number} value={number}>{lessonLabel(category, number)}</option>)}
      </select>
      <button className="sw-topic" disabled={!sessionId} onClick={() => void run("レッスンの単語を読み込んでいます…", async () => {
        const data = await request<{ lesson: VocabularyLesson }>("/api/speakwise/learning", jsonRequest({ action: "get_vocabulary_lesson", sessionId, category, lessonNumber }));
        setPreview(data.lesson);
      })}>内容を見る</button>
    </div>
    {preview && <article className="sw-resource-card"><h4>{preview.title}</h4>
      <p className="sw-note">{preview.words.length}語 · {preview.words.map(word => word.word).join(" · ")}</p>
      <button className="sw-topic" onClick={() => void run("レッスン教材を追加しています…", () => select(preview))}>このレッスンを使う</button>
    </article>}
    {selected && <article className="sw-reading sw-vocabulary-lesson"><h4>{selected.title}</h4>
      <p className="sw-note">使用中 · 単語を選ぶと練習できます。結果はVocabStreamの復習記録に保存されます。</p>
      <ul>{selectedWords.map((word, index) => <li key={`${index}:${word.word}`}>
        <button className="sw-text-link" lang="en" onClick={() => onPractice(word.word, { category: String(selectedLesson?.category), lessonNumber: Number(selectedLesson?.lessonNumber) })}>{word.word}</button>
        <p lang="en">{word.definition}</p><p className="sw-note" lang="en">{word.example}</p>
      </li>)}</ul>
      <button className="sw-topic" onClick={() => onAsk("Let's review the words and examples in the selected VocabStream lesson. Ask me one question at a time.")}>このレッスンで会話を続ける</button>
    </article>}
  </div>;
}
