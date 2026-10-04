/** Optional study metadata does not change persisted lesson/word/attempt identities. */
export type WordImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
  source: string;
  sourceUrl: string;
  creator: string;
  license: "CC0-1.0" | "CC-BY-4.0";
  licenseUrl?: string;
  credit?: string;
};

export type SentencePractice = { prompt: string; distractors: [string, string]; reviewNote: string };
export type LessonWord = {
  word: string;
  meaning?: string;
  japaneseMeaning?: string;
  example?: string;
  exampleJapanese?: string;
  explanation?: string;
  synonyms?: string;
  antonyms?: string;
  forms?: string;
  definitionType?: "text" | "image" | "image+text";
  /** Supporting diagrams explain a sense after an answer; they are not standalone picture questions. */
  imageRole?: "meaning" | "supporting";
  image?: WordImage;
  meaningDistractors?: [string, string];
  sentencePractice?: SentencePractice;
  expressionType?: "phrasal-verb" | "collocation" | "fixed-expression" | "idiom";
  usageNote?: string;
  domain?: string;
  duplicateOf?: { category: string; lessonNumber: number; word: string };
};
export type LessonData = { lesson_id?: string; title?: string; paragraph?: string; words: LessonWord[] };
export type QuestionPromptMode = "image" | "text" | "sentence" | "example";

export type LearningQuestion = {
  id: string;
  questionType: "meaning" | "quiz";
  word: string;
  prompt: string;
  promptMode?: QuestionPromptMode;
  definitionType?: LessonWord["definitionType"];
  imageRole?: LessonWord["imageRole"];
  image?: WordImage;
  choices: string[];
  answerIndex: number;
  correctAnswer: string;
  definition: string;
  example?: string;
  exampleJapanese?: string;
  explanation?: string;
  japaneseMeaning?: string;
  synonyms?: string;
  antonyms?: string;
  forms?: string;
  usageNote?: string;
  expressionType?: LessonWord["expressionType"];
  sourceCategory: string;
  sourceLessonId?: string;
  sourceLessonNumber?: number | null;
};
