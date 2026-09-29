/** Select useful, bounded context instead of resending complete database rows. */
export function makePromptMemory(memory: Record<string, unknown> | null) {
  if (!memory) return null;
  const rows = (value: unknown, count: number) => Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row)).slice(0, count)
    : [];
  const text = (value: unknown, length = 240) => typeof value === "string" ? value.slice(0, length) : "";
  const texts = (value: unknown, count = 4) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, count).map((item) => item.slice(0, 160)) : [];
  const result: Record<string, unknown[]> = {
    recentSummaries: rows(memory.recentSummaries, 2).map((row) => {
      const summary = row.summary && typeof row.summary === "object" ? row.summary as Record<string, unknown> : {};
      return { mode: text(row.lesson_mode, 60), title: text(summary.title, 120), covered: texts(summary.covered), weaknesses: texts(summary.weaknesses), recommendations: texts(summary.recommendations) };
    }),
    mistakePatterns: rows(memory.mistakePatterns, 8).map((row) => ({ type: text(row.mistake_type, 40), pattern: text(row.pattern), correction: text(row.latest_correction), count: typeof row.count === "number" ? row.count : 1 })),
    vocabProgress: rows(memory.vocabProgress, 5).map((row) => ({ lesson: text(row.lesson_title), genre: text(row.genre, 60), score: typeof row.percent_score === "number" ? row.percent_score : null })),
    weakVocabItems: rows(memory.weakVocabItems, 8).map((row) => ({ word: text(row.word, 120), answer: text(row.correct_answer), type: text(row.question_type, 60) })),
    vidmatchHistory: rows(memory.vidmatchHistory, 3).map((row) => ({ title: text(row.title), level: text(row.level, 10), topics: texts(row.topics) })),
    recommendations: texts(memory.recommendations),
  };
  // A final bound also covers escaped control characters in unusual stored data.
  while (new TextEncoder().encode(JSON.stringify(result)).length > 18000) {
    const largest = Object.keys(result).sort((a, b) => JSON.stringify(result[b]).length - JSON.stringify(result[a]).length)[0];
    result[largest].pop();
  }
  return result;
}

/** Keep a contiguous recent transcript within the transport limit, including UTF-8. */
export function boundedConversationHistory(history: Array<{ role: "user" | "assistant"; content: string }>, maxBytes = 80000) {
  const encoder = new TextEncoder();
  const selected: Array<{ role: "user" | "assistant"; content: string }> = [];
  let bytes = 2;
  for (const entry of history.slice(-100).reverse()) {
    const row = { role: entry.role, content: entry.content.slice(0, 4000) };
    const size = encoder.encode(JSON.stringify(row)).length + 1;
    if (bytes + size > maxBytes) break;
    bytes += size;
    selected.push(row);
  }
  return selected.reverse();
}
