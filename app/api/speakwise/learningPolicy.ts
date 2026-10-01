/** Versioned, deterministic evidence policy. No model writes or lifetime-only weakness scores. */
export const LEARNING_SCHEMA_VERSION = 2;
export const MEMORY_POLICY_VERSION = "lexical-recency-evidence-v1";
export type EvidenceRecord = { id: string; text: string; at: string; kind: string; confidence?: number; successes?: number; failures?: number; evidenceIds?: string[] };
export function terms(text: string): string[] {
  return [...new Set(text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])].filter(value => !["the", "and", "for", "with", "that", "this", "practice", "please"].includes(value)).slice(0, 24);
}
export function rankEvidence(records: EvidenceRecord[], query: string, now: Date, limit = 8) {
  const wanted = terms(query);
  const scored = records.filter(row => Date.parse(row.at) <= now.getTime()).map(row => {
    const words = terms(row.text);
    const overlap = wanted.filter(word => words.includes(word)).length;
    const relevance = wanted.length ? overlap / wanted.length : 0;
    const days = Math.max(0, (now.getTime() - Date.parse(row.at)) / 86_400_000);
    const recency = Math.exp(-days / 90);
    const successes = row.successes ?? 0, failures = row.failures ?? 0;
    const unresolved = failures ? failures / (failures + successes * 1.5 + 1) : 0;
    const confidence = Math.max(0, Math.min(1, row.confidence ?? 0.6));
    return { ...row, score: 4 * relevance + 0.55 * recency + confidence * (0.25 + unresolved),
      reasons: [...(overlap ? ["Matches the current learning task"] : []), ...(unresolved > 0.4 ? ["Repeated observed difficulty"] : []), ...(successes > failures ? ["Recent successful practice reduces review urgency"] : [])] };
  }).sort((a, b) => b.score - a.score || b.at.localeCompare(a.at));
  const seen = new Set<string>();
  return scored.filter(row => { const key = row.text.toLowerCase().replace(/\s+/g, " ").slice(0, 220); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, limit);
}
export type SessionMessage = { id: string; role: string; content: string; created_at: string; metadata?: Record<string, unknown> };
export type SessionEvent = { id: string; event_type: string; payload: Record<string, unknown>; created_at: string };
export function groundedObservations(messages: SessionMessage[]) {
  const byId = new Map(messages.map(message => [message.id, message]));
  const observations: Array<{ type: string; pattern: string; original: string; correction: string; explanation: string; origin: string; confidence: number; evidenceIds: string[] }> = [];
  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.metadata?.observations)) continue;
    for (const raw of message.metadata.observations.slice(0, 2)) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>, source = byId.get(String(item.evidenceMessageId));
      if (!source || source.role !== "user" || source.metadata?.inputMethod === "speech" || !["grammar", "vocabulary", "expression"].includes(String(item.type))) continue;
      if (typeof item.original !== "string" || !item.original.trim() || item.original.length > 400 || !source.content.includes(item.original)
        || /["“”«»]/.test(source.content) || typeof item.correction !== "string" || item.correction.length > 400 || item.correction === item.original
        || typeof item.explanation !== "string" || item.explanation.length > 1000) continue;
      // A copied assistant example cannot establish a learner weakness.
      if (messages.some(prior => prior.role === "assistant" && prior.created_at < source.created_at && prior.content.includes(String(item.original)))) continue;
      observations.push({ type: String(item.type), pattern: item.explanation.slice(0, 240), original: item.original,
        correction: item.correction, explanation: item.explanation, origin: "model_inferred", confidence: 0.6, evidenceIds: [source.id, message.id] });
    }
  }
  return observations.slice(0, 30);
}
export function evidenceSummary(session: Record<string, unknown>, messages: SessionMessage[], events: SessionEvent[], finalized: boolean) {
  const attempts = events.filter(event => event.event_type === "vocabulary_attempt");
  const unaided = attempts.filter(event => event.payload.correct === true && event.payload.hintUsed !== true);
  const missed = attempts.filter(event => event.payload.correct === false);
  const resources = events.filter(event => ["content_selected", "source_opened", "script_opened"].includes(event.event_type));
  const responses = events.filter(event => event.event_type === "comprehension_response");
  const learnerMessages = messages.filter(message => message.role === "user");
  const words = [...new Set(attempts.map(event => String(event.payload.word ?? "")).filter(Boolean))];
  const observations = groundedObservations(messages);
  return { schemaVersion: LEARNING_SCHEMA_VERSION, status: finalized ? "finalized" : "provisional", evidencePolicy: MEMORY_POLICY_VERSION,
    title: finalized ? "Your lesson review" : "Your lesson so far", sessionId: session.id,
    startedAt: session.started_at, completedAt: finalized ? new Date().toISOString() : null,
    lessonMode: session.lesson_mode, level: session.level, goals: session.selected_topics ?? [],
    covered: [`${learnerMessages.length} saved learner message${learnerMessages.length === 1 ? "" : "s"}.`, ...(attempts.length ? [`${attempts.length} vocabulary attempts across ${words.length} words.`] : []), ...(responses.length ? [`${responses.length} comprehension responses submitted.`] : [])],
    strengths: unaided.length ? [`${unaided.length} correct vocabulary answers without a reported hint.`] : [],
    weaknesses: [...(missed.length ? [`Review ${[...new Set(missed.map(event => String(event.payload.word)))].join(", ")}.`] : []), ...observations.slice(0, 3).map(item => `Suggested correction: ${item.original} → ${item.correction}`)],
    mistakes: [...missed.map(event => ({ type: "vocabulary", pattern: String(event.payload.word), original: String(event.payload.answer ?? ""), correction: String(event.payload.correctAnswer ?? ""), explanation: "Observed in a scored vocabulary exercise.", origin: "scored_exercise", confidence: 1, evidenceIds: [event.id] })), ...observations],
    recommendations: [...(missed.length ? ["Revisit the missed words in VocabStream, then try them without hints in a later lesson."] : []), ...(observations.length ? [`Try a new sentence using: ${observations[0].correction}`] : []), "Choose one idea from this lesson and explain it in your own words next time."],
    usefulVocabulary: words, resources: resources.map(event => ({ ...event.payload, evidenceId: event.id })),
    activities: [...attempts, ...responses].map(event => ({ type: event.event_type, ...event.payload, evidenceId: event.id })),
    evidence: { messageIds: messages.map(message => message.id), eventIds: events.map(event => event.id), learnerMessageCount: learnerMessages.length },
    uncertainty: ["Opening a resource or revealing an answer is not evidence of mastery.", "Conversation corrections are model-inferred suggestions tied to saved learner messages, not demonstrated improvement. Pronunciation is not judged from a text transcript.", ...(responses.some(event => event.payload.correct === undefined) ? ["Open-ended comprehension responses are saved but not automatically scored."] : [])],
  };
}
