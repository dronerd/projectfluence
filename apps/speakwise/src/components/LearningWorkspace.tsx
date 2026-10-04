import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import VocabularyLessonPicker from "./VocabularyLessonPicker";
import SourcePassage, { PassageAudio } from "./SourcePassage";
import VocabularyImage from "@/apps/vocabstream/src/components/VocabularyImage";
import { validWordImage } from "@/apps/vocabstream/src/lib/questionPolicy";
import { languageTag, jsonRequest, safeResourceUrl, type MaterialKind, type LearningAction, type LearningContext, type LearningDocument, type LearningEvent, type LearningRequest, type ReadingScript, type ResourceCard, type SourceSelection, type VocabularyCard } from "../lib/learning";

type Props = {
  active: boolean; locked: boolean; onBusy: (busy: boolean) => void;
  request: LearningRequest; authenticated: boolean; sessionId: string | null; level: string; targetLanguage: string;
  practice: { cardId: string; attemptId: string } | null; onPractice: (value: { cardId: string; attemptId: string }) => void;
  source: SourceSelection; events: LearningEvent[]; onSource: (source: SourceSelection) => void; onAsk: (text: string) => void;
  onListen: (text: string) => void; onStopAudio: () => void; voiceLoading: boolean;
  recordEvent: (event: LearningEvent) => Promise<void>; onActivity: () => void;
};
export type WorkspaceHandle = { open: (kind?: MaterialKind) => void; cancel: () => void; execute: (action: LearningAction, execution?: { requestId: string; context: LearningContext }) => Promise<boolean>; practice: (word: string) => void };
type Tab = "documents" | "scripts" | "content" | "words";
const DOCUMENT_STATUS: Record<string, string> = { ready: "読み込み完了", partial: "一部のページを抽出", unreadable: "文字を読み取れません", processing: "解析中", failed: "処理に失敗" };
const TAB_NAMES: Record<Tab, string> = { documents: "PDF", words: "VocabStream", content: "VidMatch", scripts: "読む・聞く" };
const MATERIAL_TABS: Record<MaterialKind, Tab> = { pdf: "documents", vocabstream: "words", vidmatch: "content", reading: "scripts" };

const LearningWorkspace = forwardRef<WorkspaceHandle, Props>(function LearningWorkspace(props, ref) {
  const { request: makeRequest, active, locked, onBusy, authenticated, sessionId, level, targetLanguage, source, events, practice, onPractice, onSource, onAsk, onListen, onStopAudio, voiceLoading, recordEvent, onActivity } = props;
  const [tab, setTab] = useState<Tab>("documents");
  const [restoreVersion, setRestoreVersion] = useState(0);
  const workspaceElementRef = useRef<HTMLElement>(null);
  const cardElementRef = useRef<HTMLElement>(null);
  const operationController = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [documentPage, setDocumentPage] = useState(1);
  const [documents, setDocuments] = useState<LearningDocument[]>([]);
  const [nextDocumentOffset, setNextDocumentOffset] = useState<number | null>(null);
  const [scripts, setScripts] = useState<ReadingScript[]>([]);
  const [nextScriptOffset, setNextScriptOffset] = useState<number | null>(null);
  const [script, setScript] = useState<ReadingScript | null>(null);
  const [topic, setTopic] = useState("");
  const [lengthWords, setLengthWords] = useState(200);
  const [kind, setKind] = useState<"adaptation" | "original" | "excerpt">("adaptation");
  const [vocabulary, setVocabulary] = useState("");
  const [query, setQuery] = useState("");
  const [resources, setResources] = useState<ResourceCard[]>([]);
  const [resource, setResource] = useState<ResourceCard | null>(null);
  const [searched, setSearched] = useState(false);
  const [word, setWord] = useState("");
  const [card, setCard] = useState<VocabularyCard | null>(null);
  const [answer, setAnswer] = useState("");
  const [personalWord, setPersonalWord] = useState("");
  const [personalDefinition, setPersonalDefinition] = useState("");
  const [personalExample, setPersonalExample] = useState("");
  const [hintUsed, setHintUsed] = useState(false);
  const [outcome, setOutcome] = useState<{ correct: boolean; reviewSaved: boolean; definition?: string } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [savedAnswers, setSavedAnswers] = useState<string[]>([]);
  const [selectedText, setSelectedText] = useState("");
  const attemptIdRef = useRef(crypto.randomUUID());
  const questionEventIdsRef = useRef<Record<string, string>>({});
  const [submittedAnswer, setSubmittedAnswer] = useState<string | null>(null);
  const scriptRequestRef = useRef<{ key: string; id: string } | null>(null);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; operationController.current?.abort(); }; }, []);

  const request: LearningRequest = async <T,>(path: string, init?: RequestInit, service?: "python" | "next") => {
    const controller = operationController.current;
    const result = await makeRequest<T>(path, { ...init, signal: controller?.signal }, service);
    if (!mountedRef.current || controller?.signal.aborted) throw new DOMException("Cancelled", "AbortError");
    return result;
  };
  function cancel() {
    operationController.current?.abort(); operationController.current = null;
    pendingRef.current = false; setBusy(""); onBusy(false); setError("");
  }
  async function run(label: string, task: () => Promise<void>) {
    if (pendingRef.current) return false;
    const controller = new AbortController(); operationController.current = controller;
    pendingRef.current = true; setBusy(label); onBusy(true); setError(""); setNotice("");
    try { await task(); return !controller.signal.aborted; }
    catch (cause) { if (mountedRef.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "処理できませんでした。もう一度お試しください。"); return false; }
    finally { if (operationController.current === controller) { pendingRef.current = false; operationController.current = null; if (mountedRef.current) { setBusy(""); onBusy(false); } } }
  }
  async function loadDocuments(offset = 0) {
    const data = await request<{ documents: LearningDocument[]; nextOffset?: number | null }>(`/api/documents?offset=${offset}`, undefined, "python");
    setDocuments(previous => offset ? [...previous, ...data.documents.filter(item => !previous.some(saved => saved.id === item.id))] : data.documents || []);
    setNextDocumentOffset(data.nextOffset ?? null);
  }
  async function loadScripts(offset = 0) {
    const data = await request<{ scripts: ReadingScript[]; nextOffset?: number | null }>(`/api/learning/scripts?offset=${offset}`, undefined, "python");
    setScripts(previous => offset ? [...previous, ...data.scripts.filter(item => !previous.some(saved => saved.id === item.id))] : data.scripts || []);
    setNextScriptOffset(data.nextOffset ?? null);
  }
  useEffect(() => {
    if (!authenticated) return;
    const tasks: Array<() => Promise<void>> = [];
    if (source.scriptId && script?.id !== source.scriptId) tasks.push(() => openScript(source.scriptId!, true));
    if (source.documentId && !documents.some(item => item.id === source.documentId && item.pages)) tasks.push(async () => {
      const data = await request<{ document: LearningDocument }>(`/api/documents/${source.documentId}`, undefined, "python");
      setDocuments(previous => [data.document, ...previous.filter(item => item.id !== data.document.id)]);
    });
    if (source.contentId && source.contentType && sessionId && resource?.id !== source.contentId) tasks.push(async () => {
      const data = await request<{ resource: ResourceCard }>("/api/speakwise/learning", jsonRequest({ action: "get_content", sessionId, contentId: source.contentId, contentType: source.contentType }));
      setResource(data.resource);
    });
    if (practice && sessionId && card?.id !== practice.cardId) tasks.push(async () => {
      const data = await request<{ card: VocabularyCard; attempt: { id: string; payload: { correct: boolean; answer: string; hintUsed: boolean; definition?: string } } | null }>("/api/speakwise/learning", jsonRequest({ action: "get_card", sessionId, cardId: practice.cardId }));
      setCard(data.card); attemptIdRef.current = practice.attemptId; setWord("");
      setHintUsed(data.attempt?.payload.hintUsed || events.some(event => event.type === "vocabulary_revealed" && event.payload.cardId === data.card.id));
      if (data.attempt) { setOutcome({ correct: data.attempt.payload.correct, reviewSaved: true, definition: data.attempt.payload.definition }); setAnswer(data.attempt.payload.answer); setSubmittedAnswer(data.attempt.payload.answer); }
      else { setOutcome(null); setAnswer(""); setSubmittedAnswer(null); }
    });
    if (tasks.length) void run("保存した教材・練習を読み込んでいます…", async () => {
      const results = await Promise.allSettled(tasks.map(task => task()));
      const failure = results.find(result => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    });
    // Restore only selected IDs; no new selection, reveal, or scored events are emitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, sessionId, source.documentId, source.scriptId, source.contentId, practice?.cardId, restoreVersion]);

  useEffect(() => { setSelectedText(""); }, [source.documentId, source.contentId, source.scriptId]);
  useEffect(() => { workspaceElementRef.current?.parentElement?.scrollTo({ top: 0 }); }, [tab, error]);
  useEffect(() => { if (tab === "words") cardElementRef.current?.scrollIntoView({ block: "nearest" }); }, [card?.id, tab]);

  async function deleteDocument(id: string) {
    let activeScript = script;
    if (source.scriptId && activeScript?.id !== source.scriptId) {
      // Resolve the owned active artifact before deletion so cached state can be
      // invalidated even when this script has not finished hydrating locally.
      const data = await request<{ script: ReadingScript }>(`/api/learning/scripts/${source.scriptId}`, undefined, "python");
      activeScript = data.script;
    }
    const derivedFromDocument = source.scriptId && activeScript?.id === source.scriptId && ((activeScript.sourceReferences || activeScript.source_refs || []).some(reference => reference.documentId === id)
      || activeScript.settings?.documentId === id);
    await request(`/api/documents/${id}`, { method: "DELETE" }, "python");
    setDocuments(previous => previous.filter(document => document.id !== id));
    // The server deletes every derived script. Drop the library cache rather
    // than leaving an artifact whose source references have disappeared.
    setScripts([]); setNextScriptOffset(null); setSelectedText("");
    if (source.documentId === id || derivedFromDocument) {
      onSource({}); setScript(null); setAnswers({}); setSavedAnswers([]);
    }
    setNotice("PDFと、そのPDFから作成した読む教材を削除しました。");
  }

  // User initiated library loads avoid source requests on every conversational turn.
  async function upload(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf")) { setError("PDFファイルを選んでください。"); return; }
    if (file.size > 8 * 1024 * 1024) { setError("8 MiB以下のPDFを選んでください。"); return; }
    await run("PDFをアップロード・解析しています…", async () => {
      const data = await request<{ document: LearningDocument }>("/api/documents", { method: "POST", headers: { "Content-Type": "application/pdf", "X-Filename": encodeURIComponent(file.name) }, body: file }, "python");
      setDocuments(previous => [data.document, ...previous.filter(item => item.id !== data.document.id)]);
      const full = await request<{ document: LearningDocument }>(`/api/documents/${data.document.id}`, undefined, "python");
      setDocuments(previous => [full.document, ...previous.filter(item => item.id !== full.document.id)]); setDocumentPage(1);
      if (["ready", "partial"].includes(full.document.status)) { onSource({ documentId: full.document.id, title: full.document.filename, kind: "pdf" }); setScript(null); setResource(null); }
      setNotice(data.document.status === "ready" ? "PDFを保存しました。ページを指定した質問もできます。" : "PDFの状態を確認してください。文字が読み取れない場合は、文字情報付きのPDFを使ってください。");
    });
  }
  async function openScript(id: string, reopening = false) {
    const data = await request<{ script: ReadingScript }>(`/api/learning/scripts/${encodeURIComponent(id)}`, undefined, "python");
    const responses = events.filter(event => event.type === "comprehension_response" && event.payload.scriptId === id);
    setScript(data.script); if (!reopening) setTab(data.script.settings?.sourceType === "vocabstream" ? "words" : "scripts"); setAnswers(Object.fromEntries(responses.map(event => [String(event.payload.questionId), String(event.payload.answer)])));
    setSavedAnswers(responses.map(event => String(event.payload.questionId))); setSelectedText("");
    if (!reopening) onSource({ scriptId: id, title: data.script.title, kind: data.script.settings?.sourceType === "vocabstream" ? "vocabstream" : "reading" });
    if (sessionId && !reopening) await recordEvent({ id: crypto.randomUUID(), type: "script_opened", payload: { scriptId: id } });
  }
  async function createScript(action?: Extract<LearningAction, { type: "create_script" }>, execution?: { requestId: string; context: LearningContext }) {
    const selected = execution?.context || source;
    const scriptKind = action?.kind || (selected.documentId || selected.contentId ? kind : "original");
    const settings = { documentId: scriptKind === "original" ? undefined : selected.documentId, contentId: scriptKind === "original" ? undefined : selected.contentId, sessionId, topic: execution ? action?.topic || undefined : topic || undefined, level: execution?.context.level || level, targetLanguage: execution?.context.targetLanguage || targetLanguage, kind: scriptKind, lengthWords: execution ? action?.lengthWords || 250 : lengthWords, vocabulary: execution ? [] : vocabulary.split(/[,、\n]/).map(x => x.trim()).filter(Boolean).slice(0, 20) };
    const key = JSON.stringify(settings);
    if (scriptRequestRef.current?.key !== key) scriptRequestRef.current = { key, id: crypto.randomUUID() };
    const data = await request<{ script: ReadingScript }>("/api/learning/script", jsonRequest({ ...settings, requestId: execution?.requestId || scriptRequestRef.current.id }), "python");
    setScript(data.script); setScripts(previous => [data.script, ...previous.filter(item => item.id !== data.script.id)]);
    const priorResponses = events.filter(event => event.type === "comprehension_response" && event.payload.scriptId === data.script.id);
    onSource({ scriptId: data.script.id, title: data.script.title, kind: "reading" }); setAnswers(Object.fromEntries(priorResponses.map(event => [String(event.payload.questionId), String(event.payload.answer)]))); setSavedAnswers(priorResponses.map(event => String(event.payload.questionId))); setTab("scripts");
    setNotice("読む教材を保存しました。保存済み教材から開き直せます。"); onActivity();
  }
  function requireLesson() { if (!sessionId) throw new Error("先にレッスンを開始してください。練習結果をそのレッスンに保存します。"); }
  async function searchContent(searchQuery: string, contentType: "all" | "video" | "text" = "all") {
    requireLesson();
    const data = await request<{ cards: ResourceCard[]; limitations?: string[] }>("/api/speakwise/learning", jsonRequest({ action: "search_content", sessionId, query: searchQuery, contentType }));
    setResources(data.cards || []); setSearched(true); setTab("content");
    setNotice(data.limitations?.join(" ") || (!data.cards?.length ? "一致する教材がありません。別のトピックや短い検索語で試してください。" : "実際のVidMatchカタログから取得しました。"));
  }
  async function selectResource(item: ResourceCard) {
    requireLesson();
    const data = await request<{ resource: ResourceCard }>("/api/speakwise/learning", jsonRequest({ action: "get_content", sessionId, contentId: item.id, contentType: item.contentType }));
    setResource(data.resource); setScript(null); onSource({ contentId: item.id, contentType: item.contentType, title: data.resource.title, kind: "vidmatch" });
    await recordEvent({ id: crypto.randomUUID(), type: "source_opened", payload: { contentId: item.id, contentType: item.contentType } });
    setNotice(data.resource.passages?.length ? "この教材をレッスンの資料に選びました。" : "本文・字幕はありません。タイトルと提供されたメタデータだけを使います。");
  }
  async function practiceWord(nextWord: string, passageContext?: string, lesson?: { category: string; lessonNumber: number }) {
    requireLesson();
    const data = await request<{ card: VocabularyCard | null; message?: string; canSavePersonalWord?: boolean }>("/api/speakwise/learning", jsonRequest({ action: "practice_word", sessionId, word: nextWord, ...lesson, context: passageContext || selectedText || undefined }));
    setTab("words");
    if (!data.card) { setCard(null); setNotice(data.message || "この語の練習問題は利用できません。"); setPersonalWord(data.canSavePersonalWord ? nextWord : ""); setPersonalDefinition(""); setPersonalExample(""); return; }
    setPersonalWord(""); setCard(data.card); setAnswer(""); setSubmittedAnswer(null); setHintUsed(false); setOutcome(null); attemptIdRef.current = crypto.randomUUID(); setWord("");
    onPractice({ cardId: data.card.id, attemptId: attemptIdRef.current });
  }
  async function submitVocabulary() {
    if (!card || !answer || outcome) return;
    setSubmittedAnswer(answer);
    const data = await request<{ correct: boolean; reviewSaved: boolean; definition?: string }>("/api/speakwise/learning", jsonRequest({ action: "answer_vocabulary", sessionId, cardId: card.id, attemptId: attemptIdRef.current, answer, hintUsed }));
    setOutcome(data); onActivity();
  }
  async function submitComprehension(questionId: string) {
    if (!script || !answers[questionId]?.trim()) return;
    requireLesson();
    const eventKey = `${script.id}:${questionId}`;
    questionEventIdsRef.current[eventKey] ||= crypto.randomUUID();
    await recordEvent({ id: questionEventIdsRef.current[eventKey], type: "comprehension_response", payload: { scriptId: script.id, questionId, answer: answers[questionId] } });
    setSavedAnswers(previous => [...previous, questionId]); setNotice("回答を保存しました。下の参考回答と比べて、会話でフィードバックを受けられます。"); onActivity();
  }
  async function selectDocument(item: LearningDocument) {
    const data = await request<{ document: LearningDocument }>(`/api/documents/${item.id}`, undefined, "python");
    if (!["ready", "partial"].includes(data.document.status)) throw new Error("文字を読み取れるPDFを選んでください。");
    setDocuments(previous => [data.document, ...previous.filter(saved => saved.id !== item.id)]);
    setScript(null); setResource(null); setDocumentPage(1);
    onSource({ documentId: item.id, title: data.document.filename, kind: "pdf" });
  }
  useImperativeHandle(ref, () => ({
    open: kind => { if (kind) setTab(MATERIAL_TABS[kind]); setError(""); setRestoreVersion(value => value + 1); },
    cancel,
    execute: async (action, execution) => {
      if (action.type === "open_materials") { setTab(MATERIAL_TABS[action.material]); return true; }
      if (action.type === "search_content") { setQuery(action.query); return run("VidMatchの教材を検索しています…", () => searchContent(action.query, action.contentType)); }
      if (action.type === "practice_vocabulary") return run("単語カードを準備しています…", () => practiceWord(action.word));
      if (action.type === "create_script") return run("読む教材を作成・保存しています…", () => createScript(action, execution));
      return false;
    },
    practice: nextWord => { setWord(nextWord); setTab("words"); void run("単語カードを準備しています…", () => practiceWord(nextWord)); },
  }));
  const selectedDocument = documents.find(item => item.id === source.documentId);
  return <section ref={workspaceElementRef} className="sw-workspace" aria-label="レッスン教材と練習">
    <div className="sw-workspace-tabs" role="tablist" aria-label="教材の種類">{(Object.keys(TAB_NAMES) as Tab[]).map(name => <button type="button" key={name} id={`sw-tab-${name}`} role="tab" aria-selected={tab === name} aria-controls={`sw-tool-${name}`} tabIndex={tab === name ? 0 : -1} onClick={() => { setTab(name); setError(""); setNotice(""); }} onKeyDown={event => { const tabs = Object.keys(TAB_NAMES) as Tab[]; const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0; if (!direction) return; event.preventDefault(); const next = tabs[(tabs.indexOf(name) + direction + tabs.length) % tabs.length]; setTab(next); document.getElementById(`sw-tab-${next}`)?.focus(); }}>{TAB_NAMES[name]}</button>)}</div>
    <div role="tabpanel" id={`sw-tool-${tab}`} aria-labelledby={`sw-tab-${tab}`} className="sw-workspace-body">
      {!authenticated && <p className="sw-note">教材の保存・練習にはログインしてください。</p>}
      {busy && <div className="sw-tool-status" role="status">{busy}<button className="sw-text-link" onClick={cancel}>操作をキャンセル</button></div>}
      {error && <p className="sw-alert" role="alert">{error} 同じ操作をもう一度お試しください。会話に戻ることもできます。</p>}
      {notice && <p className="sw-note" role="status">{notice}</p>}
      <fieldset aria-busy={Boolean(busy)} disabled={Boolean(busy) || !authenticated || !active || locked} className="sw-settings-fields">
        {tab === "documents" && <>
          <h3>PDFをレッスンに使う</h3><p className="sw-note">非公開で保存します。8 MiBまで。文字を抽出できないスキャンや図・表は、読めたものとして扱いません。</p>
          <label className="sw-label" htmlFor="sw-pdf-upload">PDFをアップロード</label><input id="sw-pdf-upload" className="sw-file" type="file" accept=".pdf,application/pdf" onChange={event => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          <button className="sw-text-link" onClick={() => void run("保存済みPDFを読み込んでいます…", loadDocuments)}>保存済みPDFを表示</button>
          {nextDocumentOffset !== null && <button className="sw-text-link" onClick={() => void run("以前のPDFを読み込んでいます…", () => loadDocuments(nextDocumentOffset))}>以前のPDFをさらに表示</button>}
          {!!source.documentId && !selectedDocument && <p className="sw-note">選択中のPDF: {source.documentId} <button className="sw-text-link" onClick={() => onSource({})}>選択を解除</button></p>}
          <div className="sw-resource-list">{documents.map(item => <article key={item.id} className={`sw-resource-card ${source.documentId === item.id ? "is-selected" : ""}`}><h4>{item.filename}</h4><p className="sw-note">{item.pageCount ?? item.page_count ?? "?"}ページ · {DOCUMENT_STATUS[item.status] || "状態を確認中"}</p>{item.warnings?.map(warning => <p className="sw-note" key={warning}>{warning}</p>)}<div className="sw-action-row"><button className="sw-topic" aria-pressed={source.documentId === item.id} disabled={!["ready", "partial"].includes(item.status)} onClick={() => void run("PDFを読み込んでいます…", () => selectDocument(item))}>{source.documentId === item.id ? "このPDFを使用中" : "このPDFを使う"}</button><button className="sw-text-link" onClick={() => void run("PDFを削除しています…", () => deleteDocument(item.id))}>PDFと関連教材を削除</button></div></article>)}</div>
          {selectedDocument && !selectedDocument.pages && <button className="sw-text-link" onClick={() => void run("ページを読み込んでいます…", async () => { const data = await request<{ document: LearningDocument }>(`/api/documents/${selectedDocument.id}`, undefined, "python"); setDocuments(previous => previous.map(item => item.id === data.document.id ? data.document : item)); })}>PDFのページ本文を表示</button>}
          {selectedDocument?.pages && <article className="sw-reading"><label className="sw-label" htmlFor="sw-pdf-page">読むページ</label><select id="sw-pdf-page" className="sw-select" value={documentPage} onChange={event => { setDocumentPage(Number(event.target.value)); setSelectedText(""); }}>{selectedDocument.pages.map(page => <option key={page.page} value={page.page}>p. {page.page}{page.status !== "readable" ? " · 抽出できないページ" : ""}</option>)}</select>{selectedDocument.pages.filter(page => page.page === documentPage).map(page => <div key={page.page}><p className="sw-note">PDFから抽出した本文 · p. {page.page}。図表やレイアウトの意味は解釈していません。</p>{page.status === "readable" ? <><PassageAudio text={page.text} onListen={onListen} onStop={onStopAudio} loading={voiceLoading} /><SourcePassage text={page.text} language={targetLanguage} onPractice={word => { setSelectedText(page.text.slice(0, 1800)); void run("単語カードを準備しています…", () => practiceWord(word, page.text.slice(0, 1800))); }} /><button className="sw-topic" disabled={!sessionId} onClick={() => onAsk(`選択したPDFの page ${page.page} について、内容を理解する質問をしてください。`)}>このページで読解を練習</button></> : <p className="sw-alert">このページの文字は読み取れていません。文字情報付きのPDFをアップロードしてください。</p>}</div>)}</article>}
          {source.documentId && !sessionId && <p className="sw-note">PDFを選んだら教材を閉じてレッスンを始めると、要約や読解の質問ができます。</p>}
          {source.documentId && <div className="sw-action-row"><button className="sw-topic" disabled={!sessionId} onClick={() => onAsk("選択したPDF全体を、ページの参照を付けて要約してください。読めないページがあれば教えてください。")}>PDF全体を要約</button><button className="sw-topic" onClick={() => { setKind("adaptation"); setTab("scripts"); }}>このPDFから読む教材を作る</button></div>}
        </>}
        {tab === "scripts" && <>
          <h3>読む・聞く → 単語 → 理解を確認</h3>
          <details className="sw-details" open={!script}><summary>読む教材を作る</summary><p className="sw-note">{source.documentId ? "選択中のPDFを使います。" : source.contentId ? "選択中のVidMatch教材を使います。" : "トピックからオリジナルの練習文を作ります。"}</p><label className="sw-label" htmlFor="sw-script-topic">トピック・重点</label><input id="sw-script-topic" className="sw-input" value={topic} maxLength={300} onChange={e => setTopic(e.target.value)} placeholder="例：旅行先での会話" /><div className="sw-setting-pair"><div><label className="sw-label" htmlFor="sw-script-kind">教材の種類</label><select id="sw-script-kind" className="sw-select" value={source.documentId || source.contentId ? kind : "original"} onChange={e => setKind(e.target.value as typeof kind)} disabled={!source.documentId && !source.contentId}><option value="adaptation">やさしく書き換える</option><option value="excerpt">出典から抜粋</option><option value="original">オリジナル</option></select></div><div><label className="sw-label" htmlFor="sw-script-length">長さ（語数）</label><select id="sw-script-length" className="sw-select" value={lengthWords} onChange={e => setLengthWords(Number(e.target.value))}>{[100, 200, 400, 600].map(count => <option key={count} value={count}>{count}語・約{Math.ceil(count / 100)}分</option>)}</select></div></div><label className="sw-label" htmlFor="sw-script-vocab">使いたい単語</label><input id="sw-script-vocab" className="sw-input" value={vocabulary} maxLength={500} onChange={e => setVocabulary(e.target.value)} placeholder="カンマで区切る" /><button className="sw-topic" disabled={!source.documentId && !source.contentId && !topic.trim()} onClick={() => void run("読む教材を作成・保存しています…", () => createScript())}>教材を作成・保存</button></details>
          <button className="sw-text-link" onClick={() => void run("保存済み教材を読み込んでいます…", loadScripts)}>保存済み教材を表示</button>
          {nextScriptOffset !== null && <button className="sw-text-link" onClick={() => void run("以前の教材を読み込んでいます…", () => loadScripts(nextScriptOffset))}>以前の教材をさらに表示</button>}
          {!!scripts.length && <><label className="sw-label" htmlFor="sw-saved-script">保存済み教材</label><select id="sw-saved-script" className="sw-select" value={script?.id || ""} onChange={e => { if (e.target.value) void run("教材を開いています…", () => openScript(e.target.value)); }}><option value="">教材を選ぶ</option>{scripts.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></>}
          {source.scriptId && script?.id !== source.scriptId && <button className="sw-topic" onClick={() => void run("教材を開いています…", () => openScript(source.scriptId!))}>前回の教材を開く</button>}
          {script && script.id === source.scriptId && script.settings?.sourceType !== "vocabstream" && <article className="sw-reading"><h4>{script.title}</h4><p className="sw-note">{script.kind === "excerpt" ? "出典からの抜粋" : script.kind === "adaptation" ? "学習用の書き換え" : "AI生成の練習文"} · {script.level || level} · {script.targetLanguage || targetLanguage}</p><PassageAudio text={script.body} onListen={onListen} onStop={onStopAudio} loading={voiceLoading} /><div className="sw-source-text" lang={languageTag(script.targetLanguage || targetLanguage)} onMouseUp={() => setSelectedText(window.getSelection()?.toString().trim().slice(0, 200) || "")} onTouchEnd={() => setSelectedText(window.getSelection()?.toString().trim().slice(0, 200) || "")}>{script.body}</div>{selectedText && <button className="sw-topic" onClick={() => void run("単語カードを準備しています…", () => practiceWord(selectedText, script.body.slice(0, 1800)))}>選択した語を練習: {selectedText}</button>}<div className="sw-action-row">{script.vocabulary?.map(item => { const word = typeof item === "string" ? item : item.word; return <button className="sw-topic" key={word} onClick={() => void run("単語カードを準備しています…", () => practiceWord(word, script.body.slice(0, 1800)))}>{word}</button>; })}</div>{(script.sourceReferences || script.source_refs)?.map((cite, index) => <p className="sw-note" key={index}>出典: {cite.page ? `p. ${cite.page}` : "選択した教材"}{cite.excerpt ? ` — ${cite.excerpt}` : ""}</p>)}
            {script.questions?.map((question, index) => <div className="sw-comprehension" key={question.id}><label className="sw-label" htmlFor={`sw-answer-${index}`}>{index + 1}. {question.prompt}</label><textarea id={`sw-answer-${index}`} className="sw-textarea" value={answers[question.id] || ""} maxLength={4000} disabled={savedAnswers.includes(question.id)} onChange={e => setAnswers(previous => ({ ...previous, [question.id]: e.target.value }))} /><button className="sw-topic" disabled={!sessionId || !answers[question.id]?.trim() || savedAnswers.includes(question.id)} onClick={() => void run("回答を保存しています…", () => submitComprehension(question.id))}>{savedAnswers.includes(question.id) ? "回答を保存済み" : "回答を保存・参考回答を見る"}</button>{savedAnswers.includes(question.id) && question.answer && <p className="sw-note">参考回答: {question.answer} {question.explanation}</p>}</div>)}<button className="sw-topic" disabled={!sessionId} onClick={() => onAsk(`この教材について私の要約や理解を確認してください。${Object.entries(answers).map(([id, answer]) => `回答${id}: ${answer}`).join("\n")}`)}>会話で要約・フィードバック</button></article>}
        </>}
        {tab === "content" && <>
          <h3>VidMatchの動画・記事を探す</h3><label className="sw-label" htmlFor="sw-content-query">学びたいトピック</label><div className="sw-inline-form"><input id="sw-content-query" className="sw-input" value={query} maxLength={300} onChange={e => setQuery(e.target.value)} placeholder="例：旅行、テクノロジー" /><button className="sw-topic" disabled={!query.trim() || !sessionId} onClick={() => void run("VidMatchの教材を検索しています…", () => searchContent(query))}>検索</button></div>{!sessionId && <p className="sw-note">レッスンを始めると、レベルや学習履歴に合わせて検索できます。</p>}
          {searched && !resources.length && <p className="sw-note">教材が見つかりませんでした。検索語を変えてお試しください。</p>}
          <div className="sw-resource-list">{resources.map(item => <article className={`sw-resource-card ${source.contentId === item.id ? "is-selected" : ""}`} key={item.id}><p className="sw-eyebrow">{item.contentType} · {item.source}{item.duration ? ` · ${item.duration}` : ""}</p><h4>{item.title}</h4><p className="sw-note">{item.availability === "indexed" ? "本文・字幕を使った学習ができます" : "紹介情報のみ・本文や字幕は未取得"}</p>{item.reasons?.map(reason => <p className="sw-note" key={reason}>{reason}</p>)}<div className="sw-action-row"><button className="sw-topic" onClick={() => void run("教材を読み込んでいます…", () => selectResource(item))}>レッスンで使う</button>{safeResourceUrl(item.url) && <a className="sw-topic" href={safeResourceUrl(item.url)} target="_blank" rel="noopener noreferrer" onClick={() => { if (sessionId) void run("教材を開いた記録を保存しています…", () => recordEvent({ id: crypto.randomUUID(), type: "source_opened", payload: { contentId: item.id, contentType: item.contentType } })); }}>{item.contentType === "video" ? "動画を開く" : "記事を開く"} ↗</a>}</div></article>)}</div>
          {resource && resource.id === source.contentId && <article className="sw-reading"><h4>{resource.title}</h4><p className="sw-note">ここには本文・字幕のプレビューを表示します。会話では選択中の教材から関連箇所を検索します。</p>{resource.passages?.length ? resource.passages.map((passage, index) => <p className="sw-source-text" key={index}>{passage.startMs !== undefined && <span className="sw-note">{Math.floor(passage.startMs / 60000)}:{String(Math.floor(passage.startMs / 1000) % 60).padStart(2, "0")} </span>}{passage.text}</p>) : <p className="sw-note">本文・字幕が取得できないため、詳細な内容の説明や本文ベースの問題は作れません。リンクから教材を開いて、気になった内容を会話で教えてください。</p>}<button className="sw-topic" disabled={!resource.passages?.length} onClick={() => { setKind("adaptation"); setTab("scripts"); }}>この教材から読む教材を作る</button></article>}
        </>}
        {tab === "words" && <>
          <VocabularyLessonPicker request={request} sessionId={sessionId} level={level} run={run}
            selected={script && script.id === source.scriptId && script.settings?.sourceType === "vocabstream" ? script : null}
            onSelect={selected => { setScript(selected); setResource(null); onSource({ scriptId: selected.id, title: selected.title, kind: "vocabstream" }); setNotice("VocabStreamのレッスンを選びました。単語の意味・例文を使って会話を続けられます。"); }}
            onAsk={onAsk} onPractice={(word, lesson) => void run("単語カードを準備しています…", () => practiceWord(word, undefined, lesson))} />
          <h3 className="sw-word-practice-heading">一つの単語を練習</h3><label className="sw-label" htmlFor="sw-practice-word">練習する語・フレーズ</label><div className="sw-inline-form"><input id="sw-practice-word" className="sw-input" value={word} maxLength={100} onChange={e => setWord(e.target.value)} placeholder="語・フレーズを入力" /><button className="sw-topic" disabled={!word.trim() || !sessionId} onClick={() => void run("単語カードを準備しています…", () => practiceWord(word))}>練習する</button></div>{!sessionId && <p className="sw-note">レッスン開始後に練習できます。</p>}
          {personalWord && <div className="sw-resource-card"><h4>自分だけの単語として保存: {personalWord}</h4><p className="sw-note">共有カタログには追加しません。出典で確認した意味を入力してください。この保存だけで習得済みにはなりません。</p><label className="sw-label" htmlFor="sw-personal-definition">確認した意味</label><textarea id="sw-personal-definition" className="sw-textarea" value={personalDefinition} maxLength={1500} onChange={event => setPersonalDefinition(event.target.value)} /><label className="sw-label" htmlFor="sw-personal-example">例文（任意）</label><input id="sw-personal-example" className="sw-input" value={personalExample} maxLength={1500} onChange={event => setPersonalExample(event.target.value)} /><button className="sw-topic" disabled={!personalDefinition.trim()} onClick={() => void run("自分の単語を保存しています…", async () => { await request("/api/speakwise/learning", jsonRequest({ action: "save_personal_word", sessionId, word: personalWord, definition: personalDefinition, example: personalExample, language: targetLanguage })); setNotice("自分だけの単語として保存しました。共有のVocabStreamカタログは変更していません。"); setPersonalWord(""); })}>非公開の単語を保存</button></div>}
          {card && <article ref={cardElementRef} className="sw-flashcard"><p className="sw-eyebrow">VocabStreamと共有する練習</p><h4>{hintUsed || outcome ? card.word : "意味に合う答えを選ぶ"}</h4><p>{card.question}</p>{card.senseNotice && <p className="sw-note">{card.senseNotice}</p>}{validWordImage(card.image) && <VocabularyImage image={validWordImage(card.image)!} />}<fieldset className="sw-choice-list" disabled={Boolean(outcome) || Boolean(submittedAnswer)}><legend className="sw-sr-only">答えを選択</legend>{card.choices.map(choice => <label className={`sw-choice ${answer === choice ? "is-selected" : ""}`} key={choice}><input type="radio" name="sw-vocab-answer" value={choice} checked={answer === choice} onChange={() => setAnswer(choice)} /><span>{choice}</span></label>)}</fieldset>{!card.choices.length && <><label className="sw-label" htmlFor="sw-word-answer">答え</label><input id="sw-word-answer" className="sw-input" value={answer} disabled={Boolean(outcome) || Boolean(submittedAnswer)} onChange={e => setAnswer(e.target.value)} /></>}{!outcome && <div className="sw-action-row"><button className="sw-topic" disabled={!answer.trim()} onClick={() => void run("練習結果を保存しています…", submitVocabulary)}>答えを確認・保存</button><button className="sw-text-link" disabled={hintUsed} onClick={() => { setHintUsed(true); if (sessionId) void run("ヒントの使用を記録しています…", () => recordEvent({ id: crypto.randomUUID(), type: "vocabulary_revealed", payload: { cardId: card.id } })); }}>意味をヒントとして見る</button></div>}{hintUsed && <p className="sw-note">ヒント: {card.definition}</p>}{outcome && <div className="sw-practice-result" role="status"><strong>{outcome.correct ? "正解です" : "もう一度復習しましょう"}</strong><p>{outcome.definition || card.definition}</p>{card.example && <p lang={languageTag(targetLanguage)}>{card.example}</p>}<p className="sw-note">{outcome.reviewSaved ? "VocabStreamの復習記録に保存しました。" : "共有復習への保存は確認できませんでした。"}{hintUsed ? " ヒントを使った練習として記録しています。" : ""}</p><button className="sw-topic" disabled={!sessionId} onClick={() => onAsk(`「${card.word}」を使って短い文を作る練習をしたいです。`)}>この語を会話で使う</button></div>}</article>}
        </>}
      </fieldset>

    </div>
  </section>;
});
export default LearningWorkspace;
