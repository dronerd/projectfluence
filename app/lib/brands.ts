export const learningApps = {
  vocabstream: { name: "VocabStream", href: "/vocabstream", image: "/images/vocabstream.png", purpose: "単語学習", short: "単語" },
  speakwise: { name: "SpeakWiseAI", href: "/speakwise", image: "/images/speakwise.png", purpose: "会話練習", short: "会話" },
  vidmatch: { name: "VidMatch", href: "/vidmatch", image: "/images/videofinder.png", purpose: "動画学習", short: "動画" },
} as const;

export type LearningApp = keyof typeof learningApps;
