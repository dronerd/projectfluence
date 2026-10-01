import { ApiError, isPlainObject } from "../_lib/http.ts";
import { supabaseRest } from "../_lib/supabaseRest.ts";
import { evidenceSummary, type SessionEvent, type SessionMessage } from "./learningPolicy.ts";
export type Row = Record<string, unknown>;
export function uuid(value: unknown, name = "ID"): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new ApiError(400, `${name} must be a valid identifier.`, "INVALID_ID");
  return value;
}
export function bounded(value: unknown, name: string, max: number, fallback = ""): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.length > max) throw new ApiError(400, `${name} is invalid.`, "INVALID_ARGUMENT");
  return value.trim();
}
export async function ownedSession(userId: string, sessionId: string) {
  const rows = await supabaseRest<Row[]>(`speakwise_lesson_sessions?${new URLSearchParams({ select: "*", id: `eq.${uuid(sessionId)}`, user_id: `eq.${userId}`, limit: "1" })}`);
  if (!rows[0]) throw new ApiError(404, "This lesson is unavailable. Start or reopen your own lesson.", "SESSION_UNAVAILABLE");
  return rows[0];
}
export async function readAll<T>(table: string, params: URLSearchParams): Promise<T[]> {
  const rows: T[] = [];
  // Bounded processing with explicit failure, never silently summarize a truncated session.
  for (let offset = 0; offset < 10000; offset += 500) {
    const page = await supabaseRest<T[]>(`${table}?${new URLSearchParams({ ...Object.fromEntries(params), limit: "500", offset: String(offset) })}`);
    rows.push(...page);
    if (page.length < 500) return rows;
  }
  throw new ApiError(413, "This lesson is too large to summarize safely. Its saved records remain available.", "SESSION_TOO_LARGE");
}
export async function sessionRecords(userId: string, sessionId: string) {
  const session = await ownedSession(userId, sessionId);
  const params = new URLSearchParams({ select: "*", user_id: `eq.${userId}`, session_id: `eq.${sessionId}`, order: "created_at.asc,id.asc" });
  const [messages, events, summaries] = await Promise.all([
    readAll<SessionMessage>("speakwise_lesson_messages", params), readAll<SessionEvent>("speakwise_learning_events", params),
    supabaseRest<Row[]>(`speakwise_lesson_summaries?${new URLSearchParams({ ...Object.fromEntries(params), schema_version: "gte.2", limit: "1" })}`),
  ]);
  return { session, messages, events, summary: summaries[0]?.summary ?? (messages.length || events.length ? evidenceSummary(session, messages, events, false) : null) };
}
export function jsonObject(value: unknown): Row {
  if (!isPlainObject(value)) throw new ApiError(400, "Request must be an object.", "INVALID_ARGUMENT");
  return value;
}
