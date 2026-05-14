export type MoodChoice = "great" | "okay" | "notGood";
export type LessonLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type PracticeMode = "speaking" | "writing";
export type FeedbackSection = "general" | "grammar" | "vocabulary" | "fluency" | "pronunciation" | "suggestions";

export const LEVEL_POSITIVE_FALLBACK_PROMPTS: Record<LessonLevel, string[]> = {
  A1: [
    "Great effort. Your answer gives us a good place to start.",
    "Nice try. You shared your idea clearly enough to practice from here.",
    "Good work. I can see what you want to say.",
  ],
  A2: [
    "Good effort. Your answer gives us a clear starting point.",
    "Nice work. You expressed your idea, and now we can make it stronger.",
    "Well done. Your response has a useful idea to build on.",
  ],
  B1: [
    "Good effort. Your answer gives us a clear base to improve.",
    "Nice response. You communicated your main idea, and we can refine it now.",
    "Well done. There is a clear thought here that we can develop further.",
  ],
  B2: [
    "Good work. Your answer has a clear direction, and we can sharpen it further.",
    "Nice effort. You have a solid starting point for more natural expression.",
    "Well done. Your response gives us useful content to polish.",
  ],
  C1: [
    "Strong effort. Your answer gives us meaningful material to refine.",
    "Good response. You have a clear line of thought, and we can make it more precise.",
    "Nice work. Your idea is developed enough for targeted feedback.",
  ],
  C2: [
    "Strong effort. Your response gives us rich material to polish with precision.",
    "Good work. Your answer has substance, and we can refine its nuance.",
    "Nice response. There is a clear argument here that we can make more elegant.",
  ],
};

export const LEVEL_FEEDBACK_INTRO_PROMPTS: Record<LessonLevel, string[]> = {
  A1: [
    "Now, let’s look at your feedback.",
    "Let’s check your answer together.",
    "I’ll give you simple feedback first.",
  ],
  A2: [
    "Now, let’s look at feedback for your answer.",
    "First, let’s check what you wrote.",
    "I’ll start with some helpful feedback.",
  ],
  B1: [
    "First, let’s look at feedback for your answer.",
    "I’ll start with feedback on what you wrote.",
    "Let’s review your response and improve it step by step.",
  ],
  B2: [
    "I’ll first give you feedback on your answer.",
    "Let’s begin with feedback on your response.",
    "First, let’s review the strengths and improvement points.",
  ],
  C1: [
    "Let’s begin with targeted feedback on your response.",
    "I’ll first highlight what works and what can be refined.",
    "First, let’s examine your answer for clarity, accuracy, and nuance.",
  ],
  C2: [
    "Let’s begin with precise feedback on your response.",
    "I’ll first look at the strengths, nuance, and refinements.",
    "First, let’s analyze how your answer can become more polished and natural.",
  ],
};

export const LEVEL_FEEDBACK_SECTION_PROMPTS: Record<LessonLevel, Record<FeedbackSection, string[]>> = {
  A1: {
    general: [
      "I’ll start with the main idea.",
      "First, here is the big picture.",
      "Let’s look at the general point first.",
    ],
    grammar: [
      "Now, let’s check grammar.",
      "Next, here is a grammar point.",
      "Let’s look at your sentence form.",
    ],
    vocabulary: [
      "Now, let’s look at your words.",
      "Next, about vocabulary.",
      "Here is a word choice tip.",
    ],
    fluency: [
      "Now, about fluency.",
      "Next, let’s think about smoothness.",
      "Here is a fluency point.",
    ],
    pronunciation: [
      "Now, let’s check pronunciation.",
      "Next, about clear sounds.",
      "Here is a pronunciation tip.",
    ],
    suggestions: [
      "Lastly, here are some tips for you.",
      "Finally, try these next steps.",
      "To finish, here is what to practice next.",
    ],
  },
  A2: {
    general: [
      "I’ll start with the general feedback.",
      "First, let’s look at the main point.",
      "Let’s begin with the overall picture.",
    ],
    grammar: [
      "Now, moving on to grammar.",
      "Next, let’s check your grammar.",
      "Here is one grammar area to improve.",
    ],
    vocabulary: [
      "Next, about your vocabulary use.",
      "Now, let’s look at word choice.",
      "Here is a vocabulary suggestion.",
    ],
    fluency: [
      "On your fluency, here is one point.",
      "Now, let’s think about how smoothly it sounds.",
      "Next, about the flow of your answer.",
    ],
    pronunciation: [
      "Now, about pronunciation.",
      "Next, let’s focus on clear pronunciation.",
      "Here is one pronunciation point.",
    ],
    suggestions: [
      "Lastly, here are some improvement tips for you.",
      "Finally, here are your next practice steps.",
      "To wrap up, try these tips next.",
    ],
  },
  B1: {
    general: [
      "I’ll start with the overall feedback.",
      "First, here is the general impression.",
      "Let’s begin with the main strengths and issues.",
    ],
    grammar: [
      "Now, moving on to grammar.",
      "Next, let’s look at grammar accuracy.",
      "Here are the grammar points to notice.",
    ],
    vocabulary: [
      "Next, about your vocabulary use.",
      "Now, let’s look at word choice and range.",
      "Here are some vocabulary notes.",
    ],
    fluency: [
      "On fluency, here is what I noticed.",
      "Next, let’s look at the flow of your answer.",
      "Now, about how naturally the answer moves.",
    ],
    pronunciation: [
      "Now, let’s look at pronunciation.",
      "Next, here are pronunciation notes.",
      "On pronunciation, focus on this point.",
    ],
    suggestions: [
      "Lastly, here are some improvement tips for you.",
      "Finally, here are practical next steps.",
      "To finish, here is what to practice next.",
    ],
  },
  B2: {
    general: [
      "I’ll start with the general strengths and areas to improve.",
      "First, let’s look at the overall effectiveness of your response.",
      "Let’s begin with the broad feedback.",
    ],
    grammar: [
      "Now, moving on to grammar and accuracy.",
      "Next, let’s refine the grammar.",
      "Here are the grammar points that would make it stronger.",
    ],
    vocabulary: [
      "Next, about your vocabulary use.",
      "Now, let’s look at precision in word choice.",
      "Here are some vocabulary refinements.",
    ],
    fluency: [
      "On your fluency, here is what could sound smoother.",
      "Next, let’s look at flow and natural pacing.",
      "Now, about the smoothness of your response.",
    ],
    pronunciation: [
      "Now, let’s focus on pronunciation clarity.",
      "Next, here are pronunciation refinements.",
      "On pronunciation, this is worth practicing.",
    ],
    suggestions: [
      "Lastly, here are some focused improvement tips.",
      "Finally, here are your next steps for practice.",
      "To wrap up, here is how to make the answer stronger next time.",
    ],
  },
  C1: {
    general: [
      "I’ll start with the overall quality of the response.",
      "First, let’s consider the response as a whole.",
      "Let’s begin with the main communicative effect.",
    ],
    grammar: [
      "Now, moving on to grammatical control.",
      "Next, let’s refine accuracy and sentence structure.",
      "Here are the grammar points affecting precision.",
    ],
    vocabulary: [
      "Next, about vocabulary range and precision.",
      "Now, let’s look at lexical choice.",
      "Here are vocabulary refinements for a more natural answer.",
    ],
    fluency: [
      "On fluency, here is how the response can flow better.",
      "Next, let’s look at pacing and cohesion.",
      "Now, about how smoothly the ideas connect.",
    ],
    pronunciation: [
      "Now, let’s consider pronunciation and delivery.",
      "Next, here are pronunciation details to refine.",
      "On pronunciation, this point will improve clarity.",
    ],
    suggestions: [
      "Lastly, here are targeted improvement tips.",
      "Finally, here are the most useful next steps.",
      "To finish, here is what will make the response more polished.",
    ],
  },
  C2: {
    general: [
      "I’ll start with the overall impact and nuance.",
      "First, let’s evaluate the response as a whole.",
      "Let’s begin with the broad rhetorical effect.",
    ],
    grammar: [
      "Now, moving on to grammatical precision.",
      "Next, let’s examine accuracy and structural elegance.",
      "Here are the grammar refinements that affect polish.",
    ],
    vocabulary: [
      "Next, about lexical precision and nuance.",
      "Now, let’s look at vocabulary range and register.",
      "Here are vocabulary refinements for a more sophisticated answer.",
    ],
    fluency: [
      "On fluency, here is how the delivery can feel more seamless.",
      "Next, let’s consider flow, rhythm, and cohesion.",
      "Now, about the smoothness and control of the response.",
    ],
    pronunciation: [
      "Now, let’s consider pronunciation and expressive control.",
      "Next, here are pronunciation refinements for clarity and nuance.",
      "On pronunciation, this detail will improve delivery.",
    ],
    suggestions: [
      "Lastly, here are precise improvement tips.",
      "Finally, here are the highest-value next steps.",
      "To close, here is how to make the response more refined.",
    ],
  },
};

export const LEVEL_PRACTICE_CONFIRMATION_PROMPTS: Record<LessonLevel, string[]> = {
  A1: [
    "Do you want to try this question?",
    "Shall we use this question?",
    "Ready to answer this question?",
  ],
  A2: [
    "Would you like to practice with this question?",
    "Do you want to try answering this question?",
    "Shall we use this question for practice?",
  ],
  B1: [
    "Would you like to use this question for practice?",
    "Shall we practice with this question?",
    "Ready to try answering this question?",
  ],
  B2: [
    "Would you like to practice using this question?",
    "Do you want to work with this question?",
    "Shall we use this as your practice question?",
  ],
  C1: [
    "Would you like to develop an answer to this question?",
    "Shall we use this prompt for your practice response?",
    "Do you want to practice with this question?",
  ],
  C2: [
    "Would you like to craft a response to this prompt?",
    "Shall we use this question as the basis for your practice?",
    "Do you want to work with this prompt?",
  ],
};

export const LEVEL_PRACTICE_START_PROMPTS: Record<LessonLevel, Record<PracticeMode, string[]>> = {
  A1: {
    speaking: ["Let’s practice speaking.", "Now let’s speak a little.", "Time for speaking practice."],
    writing: ["Let’s practice writing.", "Now let’s write a little.", "Time for writing practice."],
  },
  A2: {
    speaking: ["Let’s practice speaking.", "Now let’s do speaking practice.", "Let’s start a speaking task."],
    writing: ["Let’s practice writing.", "Now let’s do writing practice.", "Let’s start a writing task."],
  },
  B1: {
    speaking: ["Let’s practice speaking.", "Let’s begin your speaking practice.", "Now let’s work on speaking."],
    writing: ["Let’s practice writing.", "Let’s begin your writing practice.", "Now let’s work on writing."],
  },
  B2: {
    speaking: ["Let’s move into speaking practice.", "Let’s begin a speaking task.", "Now let’s work on your spoken response."],
    writing: ["Let’s move into writing practice.", "Let’s begin a writing task.", "Now let’s work on your written response."],
  },
  C1: {
    speaking: ["Let’s move into focused speaking practice.", "Let’s begin a more developed speaking task.", "Now let’s work on expressing your ideas clearly."],
    writing: ["Let’s move into focused writing practice.", "Let’s begin a more developed writing task.", "Now let’s work on shaping your response."],
  },
  C2: {
    speaking: ["Let’s move into advanced speaking practice.", "Let’s begin a nuanced speaking task.", "Now let’s work on precision in your spoken response."],
    writing: ["Let’s move into advanced writing practice.", "Let’s begin a nuanced writing task.", "Now let’s work on precision in your written response."],
  },
};

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
