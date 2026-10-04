import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/app/api/_lib/supabaseAuth";
import { apiError, ApiError, readJsonBody } from "@/app/api/_lib/http";
import { supabaseRest } from "@/app/api/_lib/supabaseRest";
import { parseLessonFields, stringList } from "../validation";
import { bounded, jsonObject, ownedSession, sessionRecords, uuid, type Row } from "../store";
import { evidenceSummary } from "../learningPolicy";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) throw new ApiError(401, "Sign in to reopen saved lessons.", "LOGIN_REQUIRED");
    let id = request.nextUrl.searchParams.get("sessionId");
    if (!id) {
      const rows = await supabaseRest<Row[]>(`speakwise_lesson_sessions?${new URLSearchParams({ select: "id", user_id: `eq.${user.id}`, status: "eq.active", order: "updated_at.desc", limit: "1" })}`);
      id = rows[0]?.id as string | undefined ?? null;
    }
    return NextResponse.json(id ? await sessionRecords(user.id, uuid(id)) : { session: null, messages: [], events: [], summary: null });
  } catch (error) { return apiError(error, "speakwise.sessions.read"); }
}
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) throw new ApiError(401, "Sign in to save your lesson.", "LOGIN_REQUIRED");
    const body = jsonObject(await readJsonBody(request, 12000));
    if (body.action === "complete") {
      const records = await sessionRecords(user.id, uuid(body.sessionId));
      if (records.session.status === "completed") return NextResponse.json({ ok: true, summary: records.summary });
      const summary = evidenceSummary(records.session, records.messages, records.events, true);
      const saved = await supabaseRest<Row>("rpc/complete_speakwise_session", { method: "POST", body: JSON.stringify({ p_user_id: user.id, p_session_id: body.sessionId, p_summary: summary }) });
      return NextResponse.json({ ok: true, summary: saved.summary });
    }
    const fields = parseLessonFields(body);
    const id = uuid(body.sessionId ?? crypto.randomUUID());
    const rows = await supabaseRest<Row[]>("speakwise_lesson_sessions?select=*&on_conflict=id", {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ id, user_id: user.id, mode: fields.mode, lesson_mode: fields.lessonMode, level: fields.level,
        planned_duration_minutes: fields.durationMinutes, selected_topics: fields.topics, selected_components: [fields.lessonMode] }),
    });
    const session = rows[0] ?? await ownedSession(user.id, id);
    return NextResponse.json({ ok: true, session });
  } catch (error) { return apiError(error, "speakwise.sessions.create"); }
}
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) throw new ApiError(401, "Sign in to save your lesson.", "LOGIN_REQUIRED");
    const body = jsonObject(await readJsonBody(request, 250000));
    const sessionId = uuid(body.sessionId);
    const messages = body.messages ?? [];
    if (!Array.isArray(messages) || messages.length > 80) throw new ApiError(400, "Save at most 80 messages at a time.", "INVALID_MESSAGES");
    const parsedMessages = messages.map(value => {
      const message = jsonObject(value);
      if (!["user", "assistant"].includes(String(message.role))) throw new ApiError(400, "Invalid message role.", "INVALID_MESSAGES");
      const content = bounded(message.content, "Message", 24000);
      if (!content) throw new ApiError(400, "Empty messages cannot be saved.", "INVALID_MESSAGES");
      const metadata = message.metadata === undefined ? {} : jsonObject(message.metadata);
      if (Object.keys(metadata).some(key => !["inputMethod", "requestContext"].includes(key)) || (metadata.inputMethod !== undefined && !["speech", "typed"].includes(String(metadata.inputMethod)))) throw new ApiError(400, "Message input method is invalid.", "INVALID_MESSAGES");
      if (metadata.requestContext !== undefined) {
        const context = jsonObject(metadata.requestContext);
        if (Object.keys(context).some(key => !["documentId", "contentId", "scriptId", "level", "targetLanguage", "lessonMode", "topics", "scope"].includes(key))) throw new ApiError(400, "Message context is invalid.", "INVALID_MESSAGES");
        for (const key of ["documentId", "scriptId"]) if (context[key] != null) uuid(context[key], key);
        if (context.contentId != null) bounded(context.contentId, "Content ID", 100);
        if (context.scope != null && !["focused", "whole"].includes(String(context.scope))) throw new ApiError(400, "Source scope is invalid.", "INVALID_MESSAGES");
        bounded(context.targetLanguage, "Target language", 80);
        parseLessonFields(context);
        if (context.topics !== undefined) stringList(context.topics, 12, 200);
      }
      return { id: uuid(message.id), role: message.role, content, metadata };
    });
    const state = body.state === undefined ? {} : jsonObject(body.state);
    const allowedState = ["documentId", "contentId", "contentType", "scriptId", "cardId", "practiceAttemptId", "objective", "targetLanguage", "settings", "startedAt", "elapsedSeconds", "activeTab", "materialTitle", "materialKind", "lessonMode", "level", "topics", "durationMinutes"];
    if (Object.keys(state).some(key => !allowedState.includes(key)) || JSON.stringify(state).length > 24000) throw new ApiError(400, "Lesson state is invalid.", "INVALID_STATE");
    for (const field of ["documentId", "scriptId"]) if (state[field] != null) uuid(state[field], field);
    if (state.materialTitle != null) bounded(state.materialTitle, "Material title", 300);
    if (state.materialKind != null && !["pdf", "vocabstream", "vidmatch", "reading"].includes(String(state.materialKind))) throw new ApiError(400, "Material kind is invalid.", "INVALID_STATE");
    if (state.targetLanguage !== undefined) state.targetLanguage = "en";
    const elapsed = body.elapsedSeconds ?? 0;
    if (!Number.isInteger(elapsed) || Number(elapsed) < 0 || Number(elapsed) > 86400) throw new ApiError(400, "Elapsed time is invalid.", "INVALID_STATE");
    const rawEvents = body.events ?? [];
    if (!Array.isArray(rawEvents) || rawEvents.length > 40) throw new ApiError(400, "Too many activities.", "INVALID_EVENTS");
    const events = [];
    for (const value of rawEvents) {
      const event = jsonObject(value), payload = jsonObject(event.payload);
      if (!["script_opened", "source_opened", "vocabulary_revealed", "comprehension_response", "content_dismissed"].includes(String(event.type))) throw new ApiError(400, "This activity cannot be submitted by a browser.", "INVALID_EVENTS");
      if (Object.keys(payload).some(key => !["scriptId", "documentId", "contentId", "contentType", "cardId", "questionId", "answer", "selfAssessed"].includes(key))) throw new ApiError(400, "Activity fields are invalid.", "INVALID_EVENTS");
      bounded(payload.answer, "Answer", 4000);
      for (const [field, table] of [["scriptId", "speakwise_scripts"], ["documentId", "speakwise_documents"], ["cardId", "speakwise_vocab_cards"]]) {
        if (payload[field]) {
          const records = await supabaseRest<Row[]>(`${table}?${new URLSearchParams({ select: "id", id: `eq.${uuid(payload[field])}`, user_id: `eq.${user.id}`, limit: "1" })}`);
          if (!records.length) throw new ApiError(404, "Activity source is unavailable.", "SOURCE_UNAVAILABLE");
        }
      }
      // Open answers stay unscored until a supported assessment has supplied evidence.
      events.push({ id: uuid(event.id), type: event.type, payload });
    }
    const session = await supabaseRest("rpc/save_speakwise_session_state", { method: "POST", body: JSON.stringify({ p_user_id: user.id, p_session_id: sessionId, p_messages: parsedMessages, p_events: events, p_state: state, p_elapsed: elapsed }) });
    return NextResponse.json({ ok: true, session });
  } catch (error) { return apiError(error, "speakwise.sessions.save"); }
}
