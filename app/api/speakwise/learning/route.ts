import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/app/api/_lib/supabaseAuth";
import { apiError, ApiError, readJsonBody } from "@/app/api/_lib/http";
import { supabaseRest } from "@/app/api/_lib/supabaseRest";
import { loadWordCatalog } from "@/apps/vocabstream/src/services/reviewService";
import { getCourse, courseLabel, lessonLabel } from "@/apps/vocabstream/src/lib/catalog";
import { buildWordQuestions, normalizeWord, validWordImage } from "@/apps/vocabstream/src/lib/questionPolicy";
import { isYoutubeVideoId } from "@/apps/vidmatch/src/services/videoContract";
import { bounded, jsonObject, ownedSession, uuid, type Row } from "../store";
import { terms } from "../learningPolicy";
export const runtime = "nodejs";
export type ContentCard = { id: string; title: string; contentType: string; source: string; url: string; duration: string | null; availability: "indexed" | "metadata_only"; reasons: string[]; level?: string; topics?: string[]; previouslyOpened?: boolean };
function publicUrl(value: unknown): string {
  try { const url = new URL(String(value)); if (url.protocol !== "https:" || url.username || url.password || /^(localhost|127\.|10\.|192\.168\.|\[::1\])/.test(url.hostname)) throw Error(); return url.href; }
  catch { throw new ApiError(422, "This source does not have a usable public URL.", "SOURCE_UNAVAILABLE"); }
}
async function recordEvent(userId: string, sessionId: string, id: string, type: string, payload: Row) {
  await supabaseRest("rpc/record_speakwise_event", { method: "POST", body: JSON.stringify({ p_user_id: userId, p_session_id: sessionId, p_event_id: id, p_type: type, p_payload: payload }) });
}
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) throw new ApiError(401, "Sign in to use saved learning activities.", "LOGIN_REQUIRED");
    const body = jsonObject(await readJsonBody(request, 16000)), sessionId = uuid(body.sessionId);
    const session = await ownedSession(user.id, sessionId);
    if (session.status !== "active") throw new ApiError(409, "Reopen an active lesson before starting an activity.", "SESSION_COMPLETED");
    if (body.action === "get_vocabulary_lesson" || body.action === "select_vocabulary_lesson") {
      const category = bounded(body.category, "Course", 80), lessonNumber = Number(body.lessonNumber);
      const course = getCourse(category);
      if (!course || !Number.isInteger(lessonNumber) || lessonNumber < 1 || lessonNumber > course.lessons) {
        throw new ApiError(400, "Choose an available VocabStream lesson.", "INVALID_LESSON");
      }
      const catalog = await loadWordCatalog();
      const words = catalog.filter(word => word.sourceCategory === category && word.sourceLessonNumber === lessonNumber)
        .map(word => ({ word: word.word, definition: word.meaning || "", example: word.example || "" }));
      if (!words.length) throw new ApiError(404, "This lesson is unavailable. Choose another lesson.", "LESSON_UNAVAILABLE");
      const title = `VocabStream · ${courseLabel(category)} · ${lessonLabel(category, lessonNumber)}`;
      const lesson = { category, lessonNumber, title, words };
      if (body.action === "get_vocabulary_lesson") return NextResponse.json({ lesson });
      // Keep the exact canonical content in the existing owned source-artifact
      // store. Render can ground chat/voice in it without a second catalog copy.
      const requestId = uuid(body.requestId);
      let rows = await supabaseRest<Row[]>(`speakwise_scripts?${new URLSearchParams({ select: "*", user_id: `eq.${user.id}`, request_id: `eq.${requestId}`, limit: "1" })}`);
      if (!rows[0]) {
        rows = await supabaseRest<Row[]>("speakwise_scripts?on_conflict=user_id,request_id", {
          method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
          body: JSON.stringify({ user_id: user.id, session_id: sessionId, request_id: requestId, title,
            body: words.map(word => `${word.word}: ${word.definition}\nExample: ${word.example}`).join("\n\n"),
            kind: "excerpt", source_refs: [], questions: [], vocabulary: words,
            settings: { sourceType: "vocabstream", category, lessonNumber, level: session.level, targetLanguage: "en" },
            prompt_version: "canonical-vocabstream-2026-10-04", schema_version: 1 }),
        });
        if (!rows[0]) rows = await supabaseRest<Row[]>(`speakwise_scripts?${new URLSearchParams({ select: "*", user_id: `eq.${user.id}`, request_id: `eq.${requestId}`, limit: "1" })}`);
      }
      const saved = rows[0], settings = saved?.settings as Row | undefined;
      if (!saved || saved.session_id !== sessionId || settings?.sourceType !== "vocabstream" || settings.category !== category || settings.lessonNumber !== lessonNumber) {
        throw new ApiError(409, "This selection request belongs to another lesson. Please select again.", "REQUEST_CONFLICT");
      }
      return NextResponse.json({ script: { id: saved.id, title: saved.title, body: saved.body, kind: saved.kind,
        vocabulary: saved.vocabulary, settings: saved.settings, questions: [], targetLanguage: "en" } });
    }
    if (body.action === "search_content") {
      const query = bounded(body.query, "Search query", 500);
      const result = await supabaseRest<{ videos: Row[]; texts: Row[] }>("rpc/search_speakwise_catalog", { method: "POST", body: JSON.stringify({ p_user_id: user.id, p_query: query, p_level: session.level }) });
      const type = body.contentType ?? "all";
      if (!["all", "video", "text"].includes(String(type))) throw new ApiError(400, "Choose all, video or text content.", "INVALID_ARGUMENT");
      const profiles = await supabaseRest<Row[]>(`speakwise_learner_profiles?${new URLSearchParams({ select: "preferences", user_id: `eq.${user.id}`, limit: "1" })}`);
      const preferences = profiles[0]?.preferences as Row ?? {};
      const dismissals = await supabaseRest<Row[]>(`speakwise_learning_events?${new URLSearchParams({ select: "payload", user_id: `eq.${user.id}`, event_type: "eq.content_dismissed", order: "created_at.desc", limit: "500" })}`);
      const dismissedIds = new Set(dismissals.map(event => String((event.payload as Row).contentId)));
      const minutes = Math.max(1, Number(session.planned_duration_minutes) || 20);
      const interests = Array.isArray(preferences.interests) ? preferences.interests.map(String) : [];
      const candidates: Array<ContentCard & { score: number }> = [];
      for (const row of type === "text" ? [] : result.videos) {
        if (!isYoutubeVideoId(row.video_id) || dismissedIds.has(String(row.video_id))) continue;
        const reasons = [query ? "Matches your current search" : "Available in the current catalog"];
        if (row.level === session.level) reasons.push(`Catalog difficulty matches ${session.level}`);
        if (row.indexed) reasons.push("Indexed transcript supports source-based activities");
        const isoDuration = typeof row.duration === "string" ? row.duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/) : null;
        const durationMinutes = isoDuration ? Number(isoDuration[1] ?? 0) * 60 + Number(isoDuration[2] ?? 0) + Number(isoDuration[3] ?? 0) / 60 : null;
        const fitsTime = durationMinutes !== null && durationMinutes <= minutes;
        if (fitsTime) reasons.push(`Fits your ${minutes}-minute study time`);
        if (row.previously_opened) reasons.push("Previously opened; comprehension has not been assumed");
        const topics = Array.isArray(row.topics) ? row.topics.map(String) : [];
        const interestMatch = interests.some(interest => topics.some(topic => topic.toLowerCase().includes(interest.toLowerCase())));
        if (interestMatch) reasons.push("Matches a confirmed interest");
        candidates.push({ id: String(row.video_id), title: String(row.title), contentType: "video", source: String(row.channel_name), url: `https://www.youtube.com/watch?v=${row.video_id}`, duration: row.duration ? String(row.duration) : null, availability: row.indexed ? "indexed" : "metadata_only", reasons, level: String(row.level), topics, previouslyOpened: Boolean(row.previously_opened), score: Number(row.rank) * 10 + (row.level === session.level ? 0.5 : 0) + (row.indexed ? 0.15 : 0) + (interestMatch ? 0.15 : 0) + (fitsTime ? 0.2 : 0) - (row.previously_opened ? 0.3 : 0) });
      }
      for (const row of type === "video" ? [] : result.texts) {
        if (dismissedIds.has(String(row.id))) continue;
        let url: string;
        try { url = publicUrl(row.url); } catch { continue; }
        candidates.push({ id: String(row.id), title: String(row.title), contentType: String(row.content_type), source: String(row.source), url, duration: row.word_count ? `${Math.ceil(Number(row.word_count) / 130)} min read` : null, availability: row.indexed ? "indexed" : "metadata_only", reasons: ["Matches your current search", ...(row.level === session.level ? [`Catalog difficulty matches ${session.level}`] : []), row.indexed ? "Extracted article text available" : "Only catalog metadata is available"], level: String(row.level ?? ""), topics: Array.isArray(row.topics) ? row.topics.map(String) : [], score: Number(row.rank) * 10 + (row.level === session.level ? 0.5 : 0) + (row.indexed ? 0.15 : 0) });
      }
      candidates.sort((a, b) => b.score - a.score);
      const sources = new Map<string, number>();
      const selected = candidates.filter(card => { const n = sources.get(card.source) ?? 0; sources.set(card.source, n + 1); return n < 2; }).slice(0, 6);
      const cards = selected.map(({ score, ...card }) => { void score; return card; });
      if (cards.length) await recordEvent(user.id, sessionId, body.eventId ? uuid(body.eventId) : crypto.randomUUID(), "recommendation_impression", { contentIds: cards.map(card => card.id), query: query.slice(0, 150) });
      return NextResponse.json({ cards, limitations: [...(!result.texts.length && type !== "video" ? ["No matching text resource is indexed in the current catalog. Try a different query or upload a PDF."] : []), ...(!cards.length ? ["No matching available catalog resource was found. Try a shorter topic or different content type."] : [])] });
    }
    if (body.action === "select_content" || body.action === "get_content") {
      const type = bounded(body.contentType, "Content type", 20), id = bounded(body.contentId, "Content ID", 100);
      let resource: ContentCard & { passages: Row[] };
      if (type === "video") {
        if (!isYoutubeVideoId(id)) throw new ApiError(400, "Invalid video ID.", "INVALID_ARGUMENT");
        const rows = await supabaseRest<Row[]>(`vidmatch_videos?${new URLSearchParams({ select: "video_id,title,channel_name,duration,availability_status,provider_metadata_expires_at", video_id: `eq.${id}`, availability_status: "eq.active", provider_metadata_expires_at: `gt.${new Date().toISOString()}`, limit: "1" })}`);
        if (!rows[0]) throw new ApiError(404, "This video is no longer available in the current catalog.", "SOURCE_UNAVAILABLE");
        const transcripts = await supabaseRest<Row[]>(`vidmatch_transcripts?${new URLSearchParams({ select: "id,language_code", video_id: `eq.${id}`, status: "eq.available", order: "acquired_at.desc", limit: "1" })}`);
        const chunks = transcripts[0] ? await supabaseRest<Row[]>(`vidmatch_transcript_chunks?${new URLSearchParams({ select: "chunk_id,text,start_ms,end_ms", video_id: `eq.${id}`, transcript_id: `eq.${transcripts[0].id}`, order: "chunk_index.asc", limit: "30" })}`) : [];
        resource = { id, title: String(rows[0].title), contentType: "video", source: String(rows[0].channel_name), url: `https://www.youtube.com/watch?v=${id}`, duration: rows[0].duration ? String(rows[0].duration) : null, availability: chunks.length ? "indexed" : "metadata_only", reasons: [], passages: chunks.slice(0, 6).map(chunk => ({ id: chunk.chunk_id, text: chunk.text, startMs: chunk.start_ms, endMs: chunk.end_ms })) };
      } else {
        if (!["article", "news", "website", "blog"].includes(type)) throw new ApiError(400, "Unsupported content type.", "INVALID_ARGUMENT");
        const rows = await supabaseRest<Row[]>(`vidmatch_text_content?${new URLSearchParams({ select: "*", id: `eq.${uuid(id)}`, content_type: `eq.${type}`, limit: "1" })}`);
        if (!rows[0]) throw new ApiError(404, "This resource is no longer available.", "SOURCE_UNAVAILABLE");
        const row = rows[0], paragraphs = typeof row.body === "string" ? row.body.split(/\n\s*\n/).filter(Boolean) : [];
        resource = { id, title: String(row.title), contentType: type, source: String(row.source), url: publicUrl(row.url), duration: row.word_count ? `${Math.ceil(Number(row.word_count) / 130)} min read` : null, availability: paragraphs.length ? "indexed" : "metadata_only", reasons: [], passages: paragraphs.slice(0, 6).map((text, index) => ({ id: `${id}:${index}`, text: text.slice(0, 3000) })) };
      }
      if (body.action === "get_content") return NextResponse.json({ resource, passageCoverage: "Preview passages only. Source-based chat searches the selected resource separately." });
      await supabaseRest("rpc/save_speakwise_session_state", { method: "POST", body: JSON.stringify({ p_user_id: user.id, p_session_id: sessionId, p_messages: [], p_events: [], p_state: { contentId: id, contentType: type, documentId: null, scriptId: null }, p_elapsed: 0 }) });
      await recordEvent(user.id, sessionId, uuid(body.eventId ?? crypto.randomUUID()), "content_selected", { contentId: id, contentType: type, title: resource.title, availability: resource.availability });
      return NextResponse.json({ resource, passageCoverage: "Preview passages only. Source-based chat searches the selected resource separately." });
    }
    if (body.action === "get_card") {
      const cardId = uuid(body.cardId);
      const rows = await supabaseRest<Row[]>(`speakwise_vocab_cards?${new URLSearchParams({ select: "card", id: `eq.${cardId}`, user_id: `eq.${user.id}`, session_id: `eq.${sessionId}`, limit: "1" })}`);
      if (!rows[0]) throw new ApiError(404, "Practice card is unavailable.", "CARD_UNAVAILABLE");
      const attempts = await supabaseRest<Row[]>(`speakwise_learning_events?${new URLSearchParams({ select: "id,payload,created_at", user_id: `eq.${user.id}`, session_id: `eq.${sessionId}`, event_type: "eq.vocabulary_attempt", "payload->>cardId": `eq.${cardId}`, order: "created_at.desc", limit: "1" })}`);
      return NextResponse.json({ card: rows[0].card, attempt: attempts[0] ?? null });
    }
    if (body.action === "practice_word") {
      const word = bounded(body.word, "Word", 200), context = bounded(body.context, "Context", 2000);
      if (!word) throw new ApiError(400, "Choose a word to practice.", "INVALID_ARGUMENT");
      const catalog = await loadWordCatalog(), matches = catalog.filter(item => normalizeWord(item.word) === normalizeWord(word)
        && (!body.category || item.sourceCategory === body.category)
        && (!body.lessonNumber || item.sourceLessonNumber === Number(body.lessonNumber)));
      const contextTerms = terms(context);
      matches.sort((a, b) => terms(`${b.meaning} ${b.example}`).filter(term => contextTerms.includes(term)).length - terms(`${a.meaning} ${a.example}`).filter(term => contextTerms.includes(term)).length);
      const target = matches[0];
      if (!target) return NextResponse.json({ card: null, unavailable: true, message: "This word is not in VocabStream. Save a private word with your own confirmed definition to keep it out of the shared catalog.", canSavePersonalWord: true });
      const pool = catalog.filter(item => item.sourceCategory === target.sourceCategory);
      const question = buildWordQuestions(target, pool, { category: target.sourceCategory, lessonId: target.sourceLessonId, lessonNumber: target.sourceLessonNumber }).find(question => question.questionType === "meaning");
      if (!question) return NextResponse.json({ card: null, unavailable: true, message: "This entry has no unambiguous scored exercise yet. Use its definition in a discussion instead." });
      const card = { id: crypto.randomUUID(), word: target.word, definition: question.definition, example: question.example, question: question.promptMode === "image" ? question.definition : question.prompt, choices: question.choices, answer: question.correctAnswer, sourceCategory: target.sourceCategory, sourceLessonId: target.sourceLessonId, sourceLessonNumber: target.sourceLessonNumber, image: validWordImage(target.image), senseNotice: matches.length > 1 ? "Several catalog senses exist. Check that this definition fits your passage." : undefined };
      await supabaseRest("speakwise_vocab_cards", { method: "POST", body: JSON.stringify({ id: card.id, user_id: user.id, session_id: sessionId, card }) });
      return NextResponse.json({ card });
    }
    if (body.action === "answer_vocabulary") {
      if (typeof body.hintUsed !== "boolean") throw new ApiError(400, "Report whether a hint was used.", "INVALID_ARGUMENT");
      const result = await supabaseRest("rpc/answer_speakwise_vocabulary", { method: "POST", body: JSON.stringify({ p_user_id: user.id, p_session_id: sessionId, p_card_id: uuid(body.cardId), p_attempt_id: uuid(body.attemptId), p_answer: bounded(body.answer, "Answer", 200), p_hint: body.hintUsed }) });
      return NextResponse.json(result);
    }
    if (body.action === "save_personal_word") {
      const word = bounded(body.word, "Word", 200), definition = bounded(body.definition, "Definition", 1500), language = bounded(body.language, "Language", 80, "English");
      if (!word || !definition) throw new ApiError(400, "A word and confirmed definition are required.", "INVALID_ARGUMENT");
      const rows = await supabaseRest<Row[]>("speakwise_personal_vocabulary?on_conflict=user_id,word,language", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ user_id: user.id, word, definition, language, example: bounded(body.example, "Example", 1500), provenance: "learner_confirmed" }) });
      return NextResponse.json({ ok: true, word: rows[0], message: "Saved privately. This entry does not modify the shared VocabStream catalog." });
    }
    throw new ApiError(400, "Unsupported learning action.", "UNKNOWN_ACTION");
  } catch (error) { return apiError(error, "speakwise.learning.action"); }
}
