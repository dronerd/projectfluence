import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/app/api/_lib/supabaseAuth";
import { apiError, ApiError, readJsonBody } from "@/app/api/_lib/http";
import { supabaseRest } from "@/app/api/_lib/supabaseRest";
import { bounded, jsonObject, type Row } from "../store";
import { rankEvidence, MEMORY_POLICY_VERSION, type EvidenceRecord } from "../learningPolicy";
import { stringList } from "../validation";
export const runtime = "nodejs";
const empty = () => ({ recentSummaries: [], mistakePatterns: [], vocabProgress: [], weakVocabItems: [], vidmatchHistory: [], recommendations: [], historicalEvidence: [], profile: null });
async function loadLearnerMemory(userId: string, query: string) {
  const profiles = await supabaseRest<Row[]>(`speakwise_learner_profiles?${new URLSearchParams({ select: "*", user_id: `eq.${userId}`, limit: "1" })}`);
  const profile = profiles[0] ?? { preferences: {}, memory_enabled: true };
  if (profile.memory_enabled === false) return { ...empty(), profile };
  const since = typeof profile.memory_reset_at === "string" ? profile.memory_reset_at : undefined;
  const [candidate, vocabProgress, history] = await Promise.all([
    supabaseRest<{ summaries: Row[]; events: Row[]; weakWords: Row[]; canonicalAttempts: Row[] }>("rpc/retrieve_speakwise_memory", { method: "POST", body: JSON.stringify({ p_user_id: userId, p_query: query, p_since: since ?? null }) }),
    supabaseRest<Row[]>(`vocabstream_user_lesson_progress?${new URLSearchParams({ select: "lesson_id,genre,lesson_title,percent_score,updated_at", user_id: `eq.${userId}`, ...(since ? { updated_at: `gt.${since}` } : {}), order: "updated_at.desc", limit: "8" })}`),
    supabaseRest<Row[]>(`vidmatch_video_view_history?${new URLSearchParams({ select: "video_id,title,channel_name,last_clicked_at,click_count", user_id: `eq.${userId}`, ...(since ? { last_clicked_at: `gt.${since}` } : {}), order: "last_clicked_at.desc", limit: "8" })}`),
  ]);
  const now = new Date();
  const senseKey = (word: unknown, category: unknown) => `${String(category ?? "")}::${String(word).normalize("NFKC").toLowerCase()}`;
  const outcomes = new Map<string, { successes: number; failures: number }>();
  for (const attempt of candidate.canonicalAttempts ?? []) {
    const word = senseKey(attempt.word, attempt.source_category);
    const days = Math.max(0, (now.getTime() - Date.parse(String(attempt.answered_at))) / 86400000), weight = Math.exp(-days / 90);
    const value = outcomes.get(word) ?? { successes: 0, failures: 0 };
    if (attempt.is_correct === true && attempt.hint_used !== true) value.successes += weight;
    if (attempt.is_correct === false) value.failures += weight;
    outcomes.set(word, value);
  }
  const weakWords = candidate.weakWords ?? [];
  const evidence: EvidenceRecord[] = candidate.summaries.map(row => {
    const summary = row.summary as Row, activities = Array.isArray(summary.activities) ? summary.activities as Row[] : [];
    const relevant = activities.filter(activity => activity.word && activity.sourceCategory).map(activity => outcomes.get(senseKey(activity.word, activity.sourceCategory))).filter(Boolean);
    return { id: String(row.id), text: JSON.stringify(summary).slice(0, 6000), at: String(row.created_at), kind: "lesson_summary", confidence: row.schema_version === 2 ? 0.9 : 0.35, successes: relevant.reduce((sum, item) => sum + (item?.successes ?? 0), 0), failures: relevant.reduce((sum, item) => sum + (item?.failures ?? 0), 0), evidenceIds: [String(row.id)] };
  });
  for (const row of weakWords) evidence.push({ id: String(row.id), text: `Vocabulary ${row.word}: ${row.definition ?? ""}`, at: String(row.last_mistaken_at), kind: "vocabulary", confidence: 0.9, ...(outcomes.get(senseKey(row.word, row.source_category)) ?? { failures: Math.min(5, Number(row.mistake_count)), successes: 0 }), evidenceIds: [String(row.id)] });
  for (const event of candidate.events) {
    if (event.event_type !== "vocabulary_attempt" && event.event_type !== "comprehension_response") continue;
    const payload = event.payload as Row;
    evidence.push({ id: String(event.id), text: `${payload.word ?? "Comprehension response"}: ${payload.definition ?? payload.answer ?? ""}`, at: String(event.created_at), kind: String(event.event_type), confidence: event.event_type === "vocabulary_attempt" ? 1 : 0.5, ...outcomes.get(senseKey(payload.word, payload.sourceCategory)), evidenceIds: [String(event.id)] });
  }
  const ranked = rankEvidence(evidence, query, now, 8);
  // A bounded character budget is explicit and applied after full-corpus lexical candidate selection.
  let remaining = 12000;
  const historicalEvidence = ranked.map(row => { const text = row.text.slice(0, Math.min(1800, remaining)); remaining -= text.length; return { ...row, text }; }).filter(row => row.text);
  const summaryIds = new Set(historicalEvidence.filter(row => row.kind === "lesson_summary").map(row => row.id));
  const recentSummaries = candidate.summaries.filter(row => summaryIds.has(String(row.id))).slice(0, 5);
  console.info(JSON.stringify({ event: "speakwise_memory_retrieved", policy: MEMORY_POLICY_VERSION, candidates: evidence.length, selected: historicalEvidence.length, contextChars: 12000 - remaining }));
  return { profile, recentSummaries, historicalEvidence, mistakePatterns: [], vocabProgress, weakVocabItems: historicalEvidence.filter(row => row.kind === "vocabulary"), vidmatchHistory: history,
    recommendations: recentSummaries.flatMap(row => Array.isArray((row.summary as Row)?.recommendations) ? (row.summary as Row).recommendations as string[] : []).slice(0, 6),
    retrieval: { version: MEMORY_POLICY_VERSION, contextChars: 12000 - remaining, candidateCount: evidence.length, evidenceBasis: "Scored attempts and traceable summaries. Legacy summaries have reduced confidence; missing activity is not poor performance." } };
}
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    return NextResponse.json(user ? await loadLearnerMemory(user.id, bounded(request.nextUrl.searchParams.get("query") ?? "", "Query", 500)) : empty());
  } catch (error) { return apiError(error, "speakwise.memory.read"); }
}
export async function POST() {
  // Browser-generated summaries must not manufacture mistakes or completed learning.
  return NextResponse.json({ error: "Complete the saved session through lesson-sessions to build a summary from its records.", code: "AUTHORITATIVE_SUMMARY_REQUIRED" }, { status: 409 });
}
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) throw new ApiError(401, "Sign in to update learner memory.", "LOGIN_REQUIRED");
    const body = jsonObject(await readJsonBody(request, 10000));
    const preferences = body.preferences === undefined ? undefined : jsonObject(body.preferences);
    const parsed: Row = {};
    if (preferences) {
      if (Object.keys(preferences).some(key => !["goals", "interests", "targetLanguage", "correctionStyle"].includes(key))) throw new ApiError(400, "Unsupported preference.", "INVALID_PREFERENCES");
      if (preferences.goals !== undefined) parsed.goals = stringList(preferences.goals, 10, 200);
      if (preferences.interests !== undefined) parsed.interests = stringList(preferences.interests, 10, 100);
      if (preferences.targetLanguage !== undefined) parsed.targetLanguage = bounded(preferences.targetLanguage, "Language", 80);
      if (preferences.correctionStyle !== undefined) {
        if (!["gentle", "balanced", "detailed"].includes(String(preferences.correctionStyle))) throw new ApiError(400, "Unsupported correction style.", "INVALID_PREFERENCES");
        parsed.correctionStyle = preferences.correctionStyle;
      }
    }
    if (body.memoryEnabled !== undefined && typeof body.memoryEnabled !== "boolean") throw new ApiError(400, "Memory setting must be true or false.", "INVALID_PREFERENCES");
    const prior = await supabaseRest<Row[]>(`speakwise_learner_profiles?${new URLSearchParams({ select: "*", user_id: `eq.${user.id}`, limit: "1" })}`);
    await supabaseRest("speakwise_learner_profiles?on_conflict=user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ user_id: user.id, preferences: { ...(prior[0]?.preferences as Row ?? {}), ...parsed }, version: Number(prior[0]?.version ?? 0) + 1, updated_at: new Date().toISOString(), ...(body.memoryEnabled !== undefined ? { memory_enabled: body.memoryEnabled } : {}) }) });
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error, "speakwise.memory.preferences"); }
}
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) throw new ApiError(401, "Sign in to delete learner memory.", "LOGIN_REQUIRED");
    const body = jsonObject(await readJsonBody(request, 2000));
    if (!["derived", "all"].includes(String(body.scope))) throw new ApiError(400, "Choose derived or all memory.", "INVALID_SCOPE");
    await supabaseRest("rpc/reset_speakwise_memory", { method: "POST", body: JSON.stringify({ p_user_id: user.id, p_scope: body.scope }) });
    return NextResponse.json({ ok: true, message: "SpeakWise memory was deleted. Canonical VocabStream progress and VidMatch history are preserved and excluded from personalization until new activity occurs." });
  } catch (error) { return apiError(error, "speakwise.memory.delete"); }
}
