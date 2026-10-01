/** Version 1 learning contracts. Identity always comes from the authenticated request. */
export type SourceSelection = { documentId?: string; contentId?: string; contentType?: string; scriptId?: string };
export type LearningContext = { documentId?: string; contentId?: string; scriptId?: string; level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2"; targetLanguage: string; lessonMode: string; topics: string[] };
export type SourceCitation = { page?: number; documentId?: string; contentId?: string; scriptId?: string; excerpt?: string };
export type LearningAction =
  | { type: "search_content"; query: string; contentType?: "all" | "video" | "text" }
  | { type: "practice_vocabulary"; word: string }
  | { type: "create_script"; topic?: string; kind?: "adaptation" | "original" | "excerpt"; lengthWords?: number };
export type LearningDocument = { id: string; filename: string; status: string; pageCount?: number; page_count?: number; readablePages?: number; warnings?: string[]; pages?: Array<{ page: number; text: string; status: string }> };
export type ReadingScript = {
  id: string; title: string; body: string; kind?: string; level?: string; targetLanguage?: string;
  sourceReferences?: SourceCitation[]; source_refs?: SourceCitation[];
  questions?: Array<{ id: string; prompt: string; answer?: string; explanation?: string }>;
  vocabulary?: Array<string | { word: string; definition?: string }>;
  settings?: Record<string, unknown>;
};
export type ResourceCard = { id: string; title: string; contentType: string; source: string; url?: string; duration?: string | number | null; availability: string; reasons?: string[]; passages?: Array<{ text: string; startMs?: number; endMs?: number }> };
export type VocabularyCard = { id: string; word: string; definition: string; example?: string; choices: string[]; question: string; answer?: string; image?: unknown; senseNotice?: string; sourceCategory?: string; sourceLessonNumber?: number };
export type LearningRequest = <T>(path: string, init?: RequestInit, service?: "python" | "next") => Promise<T>;
export type LearningEvent = { id: string; type: string; payload: Record<string, unknown> };
export function jsonRequest(body: unknown, method = "POST"): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
/** Never render catalog or generated URLs as executable protocols. */
export function safeResourceUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined; } catch { return undefined; }
}

export function languageTag(language: string): string {
  const names: Record<string, string> = { english: "en", japanese: "ja", spanish: "es", french: "fr", german: "de" };
  return names[language.toLowerCase()] || (/^[a-z]{2,3}(-[a-zA-Z]{2,4})?$/.test(language) ? language : "en");
}
