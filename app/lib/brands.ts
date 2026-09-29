export const learningApps = {
  vocabstream: { name: "VocabStream", href: "/vocabstream", image: "/images/vocabstream.png", purpose: "単語を学ぶ", short: "単語" },
  speakwise: { name: "SpeakWiseAI", href: "/speakwise", image: "/images/speakwise.png", purpose: "会話を練習", short: "会話" },
  vidmatch: { name: "VidMatch", href: "/vidmatch", image: "/images/videofinder.png", purpose: "動画で学ぶ", short: "動画" },
} as const;

export type LearningApp = keyof typeof learningApps;
