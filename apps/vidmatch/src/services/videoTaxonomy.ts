/** ProjectFluence editorial topics, independent of YouTube's categories and tags. */
export const TOPICS = ["travel", "daily life", "school", "food", "culture", "health", "business", "science", "technology", "environment", "society", "work", "entertainment", "history", "sport", "psychology", "nature", "creativity", "design"] as const;
export const TOPIC_LABELS: Record<typeof TOPICS[number], string> = {
  travel: "旅行", "daily life": "日常生活", school: "学校・学習", food: "食・料理", culture: "文化・芸術", health: "健康・医療", business: "ビジネス・経済", science: "科学", technology: "テクノロジー", environment: "環境", society: "社会", work: "仕事", entertainment: "音楽・エンタメ", history: "歴史", sport: "スポーツ",
  psychology: "心理学", nature: "自然", creativity: "創造性", design: "デザイン",
};
const ALIASES: Record<string, string> = {
  "daily-life": "daily life", everyday: "daily life", routine: "daily life", routines: "daily life", home: "daily life",
  education: "school", learning: "school", "education & learning": "school",
  cooking: "food", cuisine: "food", art: "culture", "art & culture": "culture",
  medicine: "health", "medicine & health": "health", economics: "business", "business & economics": "business",
  engineering: "science", physics: "science", biology: "science", mathematics: "science", optics: "science", electricity: "science", "prime numbers": "science", "chaos theory": "science",
  "computer science": "technology", "computer science & technology": "technology", "artificial intelligence": "technology", "neural networks": "technology",
  sustainability: "environment", "environmental science & sustainability": "environment",
  politics: "society", law: "society", "law & politics": "society", career: "work",
  wildlife: "nature", animals: "nature", "mental health": "psychology", architecture: "design",
  music: "entertainment", movies: "entertainment", film: "entertainment", sports: "sport",
  // Subject labels retained in the original catalog. Format tags such as
  // "Street Interviews" are deliberately not reclassified as subject topics.
  "immune system": "health", illness: "health", infection: "health", sleep: "health",
  brain: "psychology", mood: "psychology", feelings: "psychology", stress: "psychology",
  literature: "culture", poetry: "culture", philosophy: "culture", existentialism: "culture",
  "language learning": "school", reading: "school", "ancient world": "history", renaissance: "history",
  money: "business", "consumer life": "business", "stock market": "business",
};
export function normalizeTopic(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return ALIASES[normalized] ?? normalized;
}
export function normalizeTopics(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizeTopic).filter(Boolean))];
}

/** Postgres array overlap is case-sensitive. Preserve stored editorial labels
 * while matching canonical and known legacy spellings in a bounded query. */
export function queryTopicValues(values: readonly string[]): string[] {
  const topics = normalizeTopics(values).slice(0, 10);
  const variants = new Set<string>();
  const add = (value: string) => {
    variants.add(value);
    variants.add(value.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase()));
  };
  for (const topic of topics) add(topic);
  for (const [alias, topic] of Object.entries(ALIASES)) {
    if (topics.includes(topic)) add(alias);
  }
  return [...variants].sort();
}
