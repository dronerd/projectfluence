export type MoodChoice = "great" | "okay" | "notGood";

export const LESSON_GREETING_PROMPTS = [
  "How are you today?",
  "How's it going today?",
  "How are you feeling right now?",
  "How has your day been so far?",
  "How are things going for you today?",
];

export const MOOD_OPTIONS: Array<{ id: MoodChoice; label: string }> = [
  { id: "great", label: "Great!" },
  { id: "okay", label: "So-so" },
  { id: "notGood", label: "Not good" },
];

export const MOOD_RESPONSES: Record<MoodChoice, string[]> = {
  great: [
    "Great to hear!",
    "I'm glad to hear that!",
    "That's wonderful. Let's use that energy today.",
    "Nice! Let's keep that good momentum going.",
  ],
  okay: [
    "That's totally okay. Let's take it one step at a time.",
    "Thanks for sharing. We'll keep today's practice comfortable.",
    "No problem. A steady start is still a good start.",
    "I hear you. Let's warm up gently.",
  ],
  notGood: [
    "I'm sorry to hear that. I hope you feel better soon.",
    "Thanks for telling me. Let's keep things gentle today.",
    "I hope this practice can be a small positive moment for you.",
    "I'm sorry today feels hard. We'll go slowly.",
  ],
};

export const PRACTICE_CONFIRMATION_PROMPTS = [
  "Would you like to practice using this question?",
  "Do you want to practice with this question?",
  "Shall we use this question for practice?",
  "Would you like to try answering this question?",
  "Ready to practice with this question?",
];

export const LESSON_INTRO_TEMPLATES = [
  "I will make a {mode} practice for you at level {level}, on the topic of {topics}, in the style of {tests}.",
  "I'll create a {mode} practice at level {level} about {topics}, using a {tests} style.",
  "Your practice will be a level {level} {mode} activity about {topics}, with a {tests} style.",
  "Let's use a level {level} {mode} practice on {topics}, shaped like {tests}.",
  "I'll prepare a {mode} task for level {level}, focused on {topics}, in the style of {tests}.",
];

export const ANSWER_READY_PROMPTS = {
  speaking: [
    "Great! Can you speak your answer using the button below? Tell me your answer when you are ready!",
    "Nice! When you are ready, use the button below and speak your answer.",
    "Great! Press Start speaking below, then tell me your answer.",
    "Perfect. Use the speaking button below when you are ready to answer.",
  ],
  writing: [
    "Great! Can you write your answer in the box below?",
    "Nice! Please write your answer in the box below when you are ready.",
    "Great. Type your answer in the box below.",
    "Perfect. Write your answer below, and send it when you are ready.",
  ],
};
