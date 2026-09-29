export type VocabularyCourse = { id: string; title: string; level: string; description: string; lessons: number };

export const vocabularyCourses: VocabularyCourse[] = [
  { id: "word-beginner", title: "初級", level: "A1–A2", description: "身近なものや日常のやりとりに使う単語", lessons: 100 },
  { id: "word-intermediate", title: "中級", level: "B1", description: "経験や考えを伝えるための単語", lessons: 100 },
  { id: "word-advanced", title: "上級", level: "B2", description: "幅広い話題をより正確に表す単語", lessons: 100 },
  { id: "word-proficiency", title: "熟達", level: "C1–C2", description: "複雑な内容や細かなニュアンスを表す単語", lessons: 100 },
];
export const idiomCourses = vocabularyCourses.map((course) => ({ ...course, id: course.id.replace("word-", "idioms-"), lessons: 50 }));
export const allCourses = [...vocabularyCourses, ...idiomCourses];
export function getCourse(id: string) { return allCourses.find((course) => course.id === id); }
export function courseLabel(id: string) {
  const course = getCourse(id);
  return course ? `${id.startsWith("idioms-") ? "熟語" : "単語"} · ${course.title} (${course.level})` : "復習";
}
export const upcomingCourses = ["コンピューターサイエンス", "医学・健康", "ビジネス・経済", "環境科学", "法律", "政治", "工学"];
