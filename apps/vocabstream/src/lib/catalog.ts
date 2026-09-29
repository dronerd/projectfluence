/** lessons is the highest addressable lesson number, including preserved legacy lessons. */
export type VocabularyCourse = { id: string; title: string; level: string; description: string; lessons: number; firstLesson?: number };

export const vocabularyCourses: VocabularyCourse[] = [
  { id: "word-beginner", title: "初級", level: "A1–A2", description: "身近なものや日常のやりとりに使う単語", lessons: 100 },
  { id: "word-intermediate", title: "中級", level: "B1", description: "経験や考えを伝えるための単語", lessons: 100 },
  { id: "word-advanced", title: "上級", level: "B2", description: "幅広い話題をより正確に表す単語", lessons: 100 },
  { id: "word-proficiency", title: "熟達", level: "C1–C2", description: "複雑な内容や細かなニュアンスを表す単語", lessons: 100 },
];
export const idiomCourses: VocabularyCourse[] = vocabularyCourses.map((course, index) => ({
  ...course, id: course.id.replace("word-", "idioms-"), lessons: 60, firstLesson: 51,
  description: ["毎日の生活や会話で使う、基本の表現", "人づきあい・学習・旅行に役立つ表現", "仕事や話し合いで考えを伝える表現", "議論や文章で、細かな意味を正確に伝える表現"][index],
}));
export const specializedCourses: VocabularyCourse[] = [
  { id: "specialized-it", title: "IT・コンピューター", level: "B1–B2", description: "ソフトウェア・開発・セキュリティの基本語", lessons: 8 },
  { id: "specialized-engineering", title: "工学", level: "B2", description: "力・電気・設計や製造に使う基本語", lessons: 8 },
  { id: "specialized-healthcare", title: "医療・健康", level: "B1–B2", description: "診療・ケア・検査について伝える基本語", lessons: 8 },
  { id: "specialized-business", title: "ビジネス・経済", level: "B1–B2", description: "会計・会議・事業運営で使う基本語", lessons: 8 },
  { id: "specialized-environment", title: "環境科学", level: "B2", description: "生態系・気候・資源について学ぶ基本語", lessons: 8 },
  { id: "specialized-academic", title: "大学・研究", level: "B2–C1", description: "研究方法・データ・論文で使う基本語", lessons: 8 },
];
export const allCourses = [...vocabularyCourses, ...idiomCourses, ...specializedCourses];
export function courseLessonNumbers(course: VocabularyCourse, legacy = false): number[] {
  const showLegacy = legacy && Boolean(course.firstLesson);
  const first = showLegacy ? 1 : course.firstLesson ?? 1;
  const last = showLegacy ? (course.firstLesson ?? 1) - 1 : course.lessons;
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index);
}
export function getCourse(id: string) { return allCourses.find((course) => course.id === id); }
/** Display ordinals are separate from the lesson numbers used by URLs and saved progress. */
export function displayLessonNumber(category: string, storedNumber: number): number {
  const first = getCourse(category)?.firstLesson;
  return first && storedNumber >= first ? storedNumber - first + 1 : storedNumber;
}
export function lessonLabel(category: string, storedNumber: number): string {
  const first = getCourse(category)?.firstLesson;
  return `${first && storedNumber < first ? "以前の " : ""}Lesson ${displayLessonNumber(category, storedNumber)}`;
}
export function courseLabel(id: string) {
  const course = getCourse(id);
  return course ? `${id.startsWith("idioms-") ? "熟語" : id.startsWith("specialized-") ? "専門分野" : "単語"} · ${course.title} (${course.level})` : "復習";
}
