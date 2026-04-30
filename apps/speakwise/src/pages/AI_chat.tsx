
// src/pages/AI_chat.tsx
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "../lib/router-compat";
import { OPENING_QUESTIONS, LEVELS } from "../lib/openingQuestions";

// --- Types and category/lesson metadata ---
type ConversationMode = "choice" | "casual" | "lesson";
type ConversationStep =
  | "initial"
  | "setup"
  | "level"
  | "topic"
  | "confirm"
  | "test"
  | "skills"
  | "duration"
  | "components"
  | "vocab-category"
  | "structure"
  | "chatting";

interface ChatEntry {
  sender: "user" | "llm";
  text: string;
  kind?: "question";
}

const SPEAKWISE_API_URL =
  process.env.NEXT_PUBLIC_SPEAKWISE_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

const VOCAB_COMPONENT = "単語練習";

const CATEGORIES: Record<string, string> = {
  "computer-science": "Computer Science",
  "economics-business": "Economics & Business",
  "engineering": "Engineering",
  "environment": "Environment",
  "idioms-advanced": "Idioms (Advanced)",
  "idioms-beginner": "Idioms (Beginner)",
  "idioms-intermediate": "Idioms (Intermediate)",
  "idioms-proficiency": "Idioms (Proficiency)",
  "law": "Law",
  "medicine": "Medicine",
  "politics": "Politics",
  "word-advanced": "Words (Advanced)",
  "word-beginner": "Words (Beginner)",
  "word-intermediate": "Words (Intermediate)",
  "word-proficiency": "Words (Proficiency)",
};

const LESSON_COUNTS: Record<string, number> = {
  "computer-science": 40,
  "economics-business": 36,
  "engineering": 71,
  "environment": 30,
  "idioms-advanced": 28,
  "idioms-beginner": 34,
  "idioms-intermediate": 32,
  "idioms-proficiency": 26,
  "law": 22,
  "medicine": 18,
  "politics": 71,
  "word-advanced": 44,
  "word-beginner": 64,
  "word-intermediate": 50,
  "word-proficiency": 40,
};

const TOPICS = [
  "Computer Science & Technology",
  "Medicine & Health",
  "Business & Economics",
  "Environmental Science & Sustainability",
  "Law & Politics",
  "Engineering",
  "Art & Culture",
  "Education & Learning",
  "Sports & Fitness",
  "Travel & Culture Exchange",
  "Food & Nutrition",
  "Social Media & Digital Life",
];

type PracticeMode = "speaking" | "writing";
type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

const TESTS = ["特になし", "英検", "TOEFL", "TOEIC", "IELTS", "ケンブリッジ英検", "GTEC", "TEAP", "SAT", "ACT"];
const SKILLS = ["リーディング", "リスニング", "ライティング", "スピーキング"];
const COMPONENTS = [
  "単語練習",
  "文章読解",
  "会話練習",
  "文法練習",
];

export default function AI_chat() {
  const navigate = useNavigate();

  // UI styling helpers and global background
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "transparent";
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, []);

  // Styling class names (used in JSX)
  const containerClass = "app-container";
  const contentClass = "card";

  // Button class names
  const btnPrimary = "btn btn-primary";
  const btnSecondary = "btn btn-secondary";
  const btnAccent = "btn btn-accent";

  // Overall conversation state
  const [mode, setMode] = useState<ConversationMode>("choice");
  const [step, setStep] = useState<ConversationStep>("initial");

  // Common settings
  const [level, setLevel] = useState("");
  const [levelConfirmed, setLevelConfirmed] = useState(false);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [customTopic, setCustomTopic] = useState("");

  // Lesson settings
  const [selectedTests, setSelectedTests] = useState<string[]>(["特になし"]);
  const [customTest, setCustomTest] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedDuration, setSelectedDuration] = useState("15");
  const [selectedComponents, setSelectedComponents] = useState<string[]>([]);
  const [vocabCategory, setVocabCategory] = useState("word-beginner");
  const [vocabLessonType, setVocabLessonType] = useState<"range" | "individual">("range");
  const [vocabRangeStart, setVocabRangeStart] = useState("1");
  const [vocabRangeEnd, setVocabRangeEnd] = useState("5");
  const [vocabIndividualLessons, setVocabIndividualLessons] = useState<string[]>(["1"]);

  // Timer state for lessons
  const [lessonStartTime, setLessonStartTime] = useState<number | null>(null);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [currentComponent, setCurrentComponent] = useState(0);

  // Server warmup state
  const [serverWarmed, setServerWarmed] = useState(false);
  const [serverWarming, setServerWarming] = useState(false);

  // Voice / audio playback state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<string>("alloy");
  const [loadingVoiceIndex, setLoadingVoiceIndex] = useState<number | null>(null);

  // Chat state
  const [userInput, setUserInput] = useState("");
  const [chatLog, setChatLog] = useState<ChatEntry[]>([]);
  const [openingQuestion, setOpeningQuestion] = useState("");
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("speaking");
  const [displayedText, setDisplayedText] = useState<Record<number, string>>({});
  const [awaitingQuestionChoice, setAwaitingQuestionChoice] = useState(false);
  const [lastQuestionIndexForConfirmation, setLastQuestionIndexForConfirmation] = useState<number | null>(null);

  // Experimental EIKEN Grade 1 speaking practice state
  // Removed: eikenActive, eikenStage, conversationHistory, eikenDisplayText, eikenTTS, eikenMuted, eikenUserInput

  // ページマウント時にRenderのバックエンドサーバーをウォームアップ
  useEffect(() => {
    // only warm once per page mount
    let mounted = true;
    const warmUp = async () => {
      setServerWarming(true);
      try {
        await fetch(`${SPEAKWISE_API_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "__warmup__", mode: "warmup" }),
        });
        if (!mounted) return;
        setServerWarmed(true);
      } catch {
        // The local/API server may be asleep or unavailable; chat requests will surface real errors when used.
      } finally {
        if (mounted) setServerWarming(false);
      }
    };

    warmUp();
    return () => {
      mounted = false;
    };
  }, []);

  // Timer effect for lessons
  useEffect(() => {
    if (mode !== "lesson" || !lessonStartTime || step !== "chatting") return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lessonStartTime) / 1000);
      setTimeElapsed(elapsed);

      // Calculate component timing
      const structure = generateLessonStructure();
      let cumulativeTime = 0;

      for (let i = 0; i < structure.length; i++) {
        const componentTime = structure[i].minutes * 60;
        if (elapsed >= cumulativeTime + componentTime && currentComponent === i) {
          // Time to move to next component
          if (i < structure.length - 1) {
            const nextIndex = i + 1;
            setCurrentComponent(nextIndex);
            const nextComponent = structure[nextIndex];
            const movePrompt = `次は「${nextComponent.name}」に移ってください。`;
            setChatLog((prev) => {
              if (prev.some((e) => e.text === `⏱️ ${movePrompt}`)) return prev;
              return [...prev, { sender: "llm", text: `⏱️ ${movePrompt}` }];
            });
            setTimeout(() => {
              (async () => {
                const p = await getComponentPrompt(nextComponent.name);
                handleLessonStart(p);
              })();
            }, 100);
          }
        }
        cumulativeTime += componentTime;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lessonStartTime, currentComponent, mode, step, selectedDuration, selectedComponents]);

  // When in chatting step, hide global Header/BottomNav by adding a body class
  useEffect(() => {
    try {
      if (step === "chatting") {
        document.body.classList.add("hide-global-navs");
      } else {
        document.body.classList.remove("hide-global-navs");
      }
    } catch (e) {
      // ignore in SSR or environments without document
    }
    return () => {
      try { document.body.classList.remove("hide-global-navs"); } catch (e) {}
      // Removed: stop experimental flow if leaving chat
    };
  }, [step]);

  // Typing animation effect for chat messages
  useEffect(() => {
    if (chatLog.length === 0) return;
    
    const lastIndex = chatLog.length - 1;
    const lastEntry = chatLog[lastIndex];
    
    // If already displayed in full, skip
    if (displayedText[lastIndex] === lastEntry.text) return;
    
    // Start typing animation
    let currentCharIndex = (displayedText[lastIndex] || "").length;
    const fullText = lastEntry.text;
    
    if (currentCharIndex >= fullText.length) return;
    
    const typingSpeed = 30; // milliseconds per character
    const timer = setInterval(() => {
      currentCharIndex++;
      setDisplayedText((prev) => ({
        ...prev,
        [lastIndex]: fullText.slice(0, currentCharIndex),
      }));
      
      if (currentCharIndex >= fullText.length) {
        clearInterval(timer);
      }
    }, typingSpeed);
    
    return () => clearInterval(timer);
  }, [chatLog, displayedText]);

  // Watch for when a question is fully displayed, then add confirmation message
  useEffect(() => {
    // Find the last question in chatLog
    let lastQuestionIndex = -1;
    for (let i = chatLog.length - 1; i >= 0; i--) {
      if (chatLog[i].kind === "question") {
        lastQuestionIndex = i;
        break;
      }
    }
    
    // If no question or already added confirmation for this question, skip
    if (lastQuestionIndex === -1 || lastQuestionIndex === lastQuestionIndexForConfirmation) {
      return;
    }
    
    // Check if this question is fully displayed
    const questionText = chatLog[lastQuestionIndex].text;
    const displayedQuestionText = displayedText[lastQuestionIndex];
    
    if (displayedQuestionText === questionText) {
      // Question is fully displayed, add confirmation message after a short delay
      const timer = setTimeout(() => {
        setChatLog((prev) => [...prev, { sender: "llm", text: "Would you like to practice using this question?" }]);
        setAwaitingQuestionChoice(true);
        setLastQuestionIndexForConfirmation(lastQuestionIndex);
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [displayedText, chatLog, lastQuestionIndexForConfirmation]);

  // Helper functions
  const handleTopicToggle = (topic: string) => {
    if (selectedTopics.includes(topic)) {
      setSelectedTopics(selectedTopics.filter((t) => t !== topic));
    } else {
      setSelectedTopics([...selectedTopics, topic]);
    }
  };

  const handleSkillToggle = (skill: string) => {
    if (selectedSkills.includes(skill)) {
      setSelectedSkills(selectedSkills.filter((s) => s !== skill));
    } else {
      setSelectedSkills([...selectedSkills, skill]);
    }
  };

  const handleComponentToggle = (component: string) => {
    if (selectedComponents.includes(component)) {
      setSelectedComponents(selectedComponents.filter((c) => c !== component));
    } else {
      setSelectedComponents([...selectedComponents, component]);
    }
  };

  const handleTestToggle = (test: string) => {
    if (selectedTests.includes(test)) {
      setSelectedTests(selectedTests.filter((t) => t !== test));
    } else {
      setSelectedTests([...selectedTests, test]);
    }
  };

  const handleVocabLessonToggle = (lesson: string) => {
    if (vocabIndividualLessons.includes(lesson)) {
      setVocabIndividualLessons(vocabIndividualLessons.filter((l) => l !== lesson));
    } else {
      setVocabIndividualLessons([...vocabIndividualLessons, lesson]);
    }
  };

  const topicsToPass = selectedTopics.concat(customTopic ? [customTopic] : []);
  const maxLessonsForCategory = LESSON_COUNTS[vocabCategory] || 64;

  const getSelectedLevel = (): CEFRLevel => {
    return LEVELS.includes(level as CEFRLevel) ? (level as CEFRLevel) : "A1";
  };

  const getPrimaryPresetTopic = () => {
    return selectedTopics.find((topic) => OPENING_QUESTIONS[topic]) || TOPICS[0];
  };

  const getPresetOpeningQuestion = (practiceMode: PracticeMode) => {
    const topic = getPrimaryPresetTopic();
    return OPENING_QUESTIONS[topic][getSelectedLevel()][practiceMode];
  };

  const generateCustomOpeningQuestion = async (practiceMode: PracticeMode) => {
    const fallback = getPresetOpeningQuestion(practiceMode);
    const topic = customTopic.trim();
    if (!topic) return fallback;

    try {
      const res = await fetch(`${SPEAKWISE_API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message:
            `Create exactly one clear ${practiceMode} practice question for an English learner at CEFR level ${level}. ` +
            `Topic: ${topic}. ` +
            `Return only the question. Do not include a greeting, numbering, explanation, or quotation marks.`,
          level,
          topics: [topic],
          mode: "casual",
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.details || data.error || "Question request failed");
      const question = String(data.reply || "").trim();
      return question || fallback;
    } catch {
      return fallback;
    }
  };

  const getOpeningQuestion = async (practiceMode: PracticeMode) => {
    if (customTopic.trim()) return generateCustomOpeningQuestion(practiceMode);
    return getPresetOpeningQuestion(practiceMode);
  };

  const handlePracticeModeSelect = (nextMode: PracticeMode) => {
    setPracticeMode(nextMode);
    if (nextMode === "speaking") {
      setSelectedSkills(["スピーキング"]);
      setSelectedComponents(["会話練習"]);
      return;
    }

    setSelectedSkills(["ライティング"]);
    if (selectedComponents.length === 0 || selectedComponents.includes("会話練習")) {
      setSelectedComponents(["文法練習"]);
    }
  };

  const handleHomeStart = () => {
    if (practiceMode === "speaking") {
      setMode("casual");
      setSelectedSkills(["スピーキング"]);
      setSelectedComponents(["会話練習"]);
      handleSpeakingStart();
      return;
    }

    setMode("lesson");
    setSelectedSkills(["ライティング"]);
    handleWritingStart();
  };

  // Helper for generating lesson numbers for individual selection
  const generateLessonNumbers = () => {
    const max = LESSON_COUNTS[vocabCategory] || 64;
    return Array.from({ length: max }, (_, i) => (i + 1).toString());
  };

  // Helper for generating lesson numbers for range selection
  const getLessonNumbersFromRange = () => {
    const start = Math.max(1, parseInt(vocabRangeStart) || 1);
    const end = Math.min(maxLessonsForCategory, parseInt(vocabRangeEnd) || 5);
    return Array.from({ length: end - start + 1 }, (_, i) => (start + i).toString());
  };

  // Helper to generate component timing schedule
  const generateComponentTiming = () => {
    const structure = generateLessonStructure();
    let cumulativeTime = 0;
    return structure.map((item) => {
      const startTime = cumulativeTime;
      const endTime = cumulativeTime + item.minutes * 60;
      cumulativeTime = endTime;
      return {
        component: item.name,
        startSeconds: startTime,
        endSeconds: endTime,
        durationSeconds: item.minutes * 60,
      };
    });
  };

  // Load prompts from public/prompts/*.json with simple templating fallback
  const [promptsCache, setPromptsCache] = useState<Record<string, string>>({});

  const PROMPTS_BASE = "/speakwise/prompts";

  const generateComponentContentFallback = (componentName: string) => {
    // keep the previous hardcoded prompts as a fallback if fetch fails
    switch (componentName) {
      case "単語練習":
        return (
          `You are an English teacher conducting a vocabulary lesson. ` +
          `Start by saying a brief greeting (e.g., "Hi! Let's start with vocabulary practice."). ` +
          `Then, introduce 5 vocabulary words related to the student's interests (${selectedTopics.join(", ")}). ` +
          `For each word, provide the word, its meaning/definition, and an example sentence. ` +
          `After presenting all 5 words, ask the student one comprehension question to test their understanding ` +
          `(e.g., ask them to use one of the words in a sentence, or ask what a specific word means). ` +
          `Keep the tone friendly and encouraging. The student's level is ${level}.`
        );
      case "文章読解":
        return (
          `You are an English teacher conducting a reading comprehension lesson. ` +
          `Start by saying a brief greeting (e.g., "Hi! Let's do a reading comprehension activity."). ` +
          `Then, present a short, interesting text (3-5 sentences) on a topic related to the student's interests (${selectedTopics.join(", ")}). ` +
          `The text should be appropriate for the student's level (${level}). ` +
          `After presenting the text, ask one comprehension question to test the student's understanding of the main idea or details. ` +
          `Keep the tone friendly and encouraging.`
        );
      case "会話練習":
        return (
          `You are an English teacher conducting a conversation practice lesson. ` +
          `Start by saying a brief greeting (e.g., "Hi! Let's practice conversation."). ` +
          `Then, ask the student an open-ended question related to their interests (${selectedTopics.join(", ")}) ` +
          `that encourages them to have a natural conversation. ` +
          `Make sure the question is appropriate for the student's level (${level}). ` +
          `After the student responds, continue the conversation naturally by asking follow-up questions or commenting on their response. ` +
          `Keep the tone friendly, natural, and encouraging.`
        );
      case "文法練習":
        return (
          `You are an English teacher conducting a grammar lesson. ` +
          `Start by saying a brief greeting (e.g., "Hi! Let's practice grammar."). ` +
          `Then, present a grammar concept or exercise appropriate for the student's level (${level}). ` +
          `For example, you could: (1) provide a sentence with a blank and ask the student to fill it with the correct grammar form, ` +
          `or (2) ask the student to correct a sentence with a grammar error, or (3) ask them to write a sentence using a specific grammar pattern. ` +
          `After the student responds, provide feedback and explain the grammar rule briefly. ` +
          `Keep the tone friendly and encouraging.`
        );
      default:
        return `You are an English teacher. Start with a brief greeting and help the student learn English in a friendly way.`;
    }
  };

  const getPromptFilename = (componentName: string) => {
    switch (componentName) {
      case "単語練習":
        return 'vocab_practice.json';
      case "文章読解":
        return 'reading_comprehension.json';
      case "会話練習":
        return 'conversation_practice.json';
      case "文法練習":
        return 'grammar_practice.json';
      default:
        return null;
    }
  };

  const fillTemplate = (template: string) => {
    const topics = selectedTopics.concat(customTopic ? [customTopic] : []).join(', ');
    return template.replace(/{{\s*topics\s*}}/g, topics || 'general topics').replace(/{{\s*level\s*}}/g, level || 'appropriate level');
  };

  const getComponentPrompt = async (componentName: string) => {
    // return cached if available
    if (promptsCache[componentName]) return promptsCache[componentName];

    const filename = getPromptFilename(componentName);
    if (!filename) {
      const fallback = generateComponentContentFallback(componentName);
      setPromptsCache((s) => ({ ...s, [componentName]: fallback }));
      return fallback;
    }

    try {
      const res = await fetch(`${PROMPTS_BASE}/${filename}`);
      if (!res.ok) throw new Error('prompt fetch failed');
      const json = await res.json();
      const template = typeof json.prompt === 'string' ? json.prompt : JSON.stringify(json);
      const filled = fillTemplate(template);
      setPromptsCache((s) => ({ ...s, [componentName]: filled }));
      return filled;
    } catch (e) {
      // fallback
      const fallback = generateComponentContentFallback(componentName);
      setPromptsCache((s) => ({ ...s, [componentName]: fallback }));
      return fallback;
    }
  };

  // Experimental: EIKEN Grade 1 speaking practice helpers
  const getTestPath = () => {
    // Temporarily disabled to continue conversation/lesson normally
    return null;
    /*
    const test = selectedTests.find(t => ['英検', 'TOEIC', 'IELTS', 'TOEFL'].includes(t));
    if (!test) return null;
    const skill = selectedSkills.find(s => ['リスニング', 'スピーキング', 'リーディング', 'ライティング'].includes(s));
    if (!skill) return null;
    let grade = '';
    if (test === '英検') {
      if (level === 'C1' || level === 'C2') grade = '1';
      else if (level === 'B2') grade = 'pre1';
      else if (level === 'B1') grade = 'pre2';
      else if (level === 'A2') grade = '3';
      else return null;
    }
    const skillPath = skill === 'リスニング' ? 'listening' : skill === 'スピーキング' ? 'speaking' : skill === 'リーディング' ? 'reading' : 'writing';
    if (test === '英検') {
      return `/${grade}_${skillPath}`;
    } else {
      const testLower = test.toLowerCase();
      return `/${testLower}_${skillPath}`;
    }
    */
  };

  const isTestEligible = () => {
    return getTestPath() !== null;
  };

  // Removed: startEikenSession, stopEikenSession, eikenStep, eikenSubmitResponse

  // Lesson structure preview
  const generateLessonStructure = () => {
    const durationMin = parseInt(selectedDuration);
    const componentCount = selectedComponents.length || 1;
    const timePerComponent = Math.floor(durationMin / componentCount);

    return selectedComponents.map((comp) => ({
      name: comp,
      minutes: timePerComponent,
    }));
  };

  const handleSend = async () => {
    if (!userInput.trim()) return;

    const newLog: ChatEntry[] = [...chatLog, { sender: "user", text: userInput }];
    setChatLog(newLog);
    const inputText = userInput;
    const messageWithQuestionContext = openingQuestion
      ? `Practice question: ${openingQuestion}\nStudent response: ${inputText}`
      : inputText;
    setUserInput("");

    try {
      const testsToPass = selectedTests.length > 0
        ? selectedTests.map(t => t === "Other" ? customTest : t)
        : [];

      const vocabLessonsToPass = vocabLessonType === "range"
        ? getLessonNumbersFromRange()
        : vocabIndividualLessons;

      const componentTiming = generateComponentTiming();

      const payload =
        mode === "casual"
          ? {
              message: messageWithQuestionContext,
              level,
              topics: topicsToPass,
              mode: "casual",
            }
          : {
              message: messageWithQuestionContext,
              level,
              topics: topicsToPass,
              tests: testsToPass,
              skills: selectedSkills,
              duration: parseInt(selectedDuration),
              durationMinutes: parseInt(selectedDuration),
              currentComponent: currentComponent,
              currentComponentName: selectedComponents[currentComponent] || null,
              components: selectedComponents,
              componentTiming: componentTiming,
              totalTimeElapsed: timeElapsed,
              timeElapsedSeconds: timeElapsed,
              vocabCategory: selectedComponents.includes(VOCAB_COMPONENT) ? vocabCategory : null,
              vocabLessons: selectedComponents.includes(VOCAB_COMPONENT) ? vocabLessonsToPass : null,
              mode: "lesson",
            };

      const res = await fetch(`${SPEAKWISE_API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.details || data.error || "Chat request failed");
      }
      let replyText: string = data.reply || "No response";
      const llmResponse: ChatEntry = { sender: "llm", text: replyText };
      setChatLog((prev) => [...prev, llmResponse]);
    } catch (error) {
      console.error(error);
      setChatLog((prev) => [
        ...prev,
        { sender: "llm", text: "エラー: レスポンスを取得できませんでした。" },
      ]);
    }
  };

  // Fetch voice audio from backend and play it
  const fetchAndPlayVoice = async (text: string, idx?: number) => {
    if (!text) return;

    try {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch (e) {}
        audioRef.current = null;
      }
      if (typeof idx === "number") setLoadingVoiceIndex(idx);

      const res = await fetch(`${SPEAKWISE_API_URL}/api/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: selectedVoice }),
      });

      if (!res.ok) {
        console.error("Voice request failed", res.statusText);
        setLoadingVoiceIndex(null);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play().catch((e) => console.error("Audio play failed", e));
      audio.onended = () => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {}
        if (typeof idx === "number") setLoadingVoiceIndex(null);
        audioRef.current = null;
      };
    } catch (error) {
      console.error(error);
      if (typeof idx === "number") setLoadingVoiceIndex(null);
    }
  };

  // Helper to start a lesson by sending the first component prompt to the AI
  const handleLessonStart = async (prompt: string) => {
    if (!prompt.trim()) return;

    try {
      const testsToPass = selectedTests.length > 0
        ? selectedTests.map(t => t === "Other" ? customTest : t)
        : [];

      const vocabLessonsToPass = vocabLessonType === "range"
        ? getLessonNumbersFromRange()
        : vocabIndividualLessons;

      const componentTiming = generateComponentTiming();

      const payload = {
        message: prompt,
        level,
        topics: topicsToPass,
        tests: testsToPass,
        skills: selectedSkills,
        duration: parseInt(selectedDuration),
        durationMinutes: parseInt(selectedDuration),
        currentComponent: currentComponent,
        currentComponentName: selectedComponents[currentComponent] || null,
        components: selectedComponents,
        componentTiming: componentTiming,
        totalTimeElapsed: timeElapsed,
        timeElapsedSeconds: timeElapsed,
        vocabCategory: selectedComponents.includes(VOCAB_COMPONENT) ? vocabCategory : null,
        vocabLessons: selectedComponents.includes(VOCAB_COMPONENT) ? vocabLessonsToPass : null,
        mode: "lesson",
      };

      const res = await fetch(`${SPEAKWISE_API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.details || data.error || "Lesson request failed");
      }
      let replyText: string = data.reply || "No response";
      const llmResponse: ChatEntry = { sender: "llm", text: replyText };
      setChatLog((prev) => [...prev, llmResponse]);
    } catch (error) {
      console.error(error);
      setChatLog((prev) => [
        ...prev,
        { sender: "llm", text: "エラー: レスポンスを取得できませんでした。" },
      ]);
    }
  };

  const validateSharedSetup = () => {
    if (!levelConfirmed || !level) {
      alert("英語レベルを選択してください");
      return false;
    }

    if (selectedTopics.length === 0 && !customTopic.trim()) {
      alert("少なくとも1つのトピックを選択してください");
      return false;
    }

    return true;
  };

  const handleCasualPromptStart = async (prompt: string) => {
    try {
      const res = await fetch(`${SPEAKWISE_API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          level,
          topics: topicsToPass,
          mode: "casual",
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.details || data.error || "Chat request failed");
      }
      const replyText: string = data.reply || "No response";
      setChatLog((prev) => [...prev, { sender: "llm", text: replyText }]);
    } catch (error) {
      console.error(error);
      setChatLog((prev) => [
        ...prev,
        { sender: "llm", text: "エラー: レスポンスを取得できませんでした。" },
      ]);
    }
  };

  const getRandomOpeningQuestion = (practiceMode: PracticeMode) => {
    // Get all available topics from OPENING_QUESTIONS
    const availableTopics = Object.keys(OPENING_QUESTIONS);
    // Randomly select a topic
    const randomTopic = availableTopics[Math.floor(Math.random() * availableTopics.length)];
    const level = getSelectedLevel();
    const question = OPENING_QUESTIONS[randomTopic]?.[level]?.[practiceMode];
    return question || "Let's continue with the practice.";
  };

  const handleGenerateNewQuestion = async () => {
    try {
      setAwaitingQuestionChoice(false);
      setLastQuestionIndexForConfirmation(null);
      // Use random selection from the question list instead of generating new one
      const newQuestion = getRandomOpeningQuestion(practiceMode);
      setOpeningQuestion(newQuestion);
      setChatLog((prev) => [...prev, { sender: "llm", text: newQuestion, kind: "question" }]);
    } catch (error) {
      console.error(error);
      setChatLog((prev) => [
        ...prev,
        { sender: "llm", text: "エラー: 新しい問題を生成できませんでした。" },
      ]);
    }
  };

  const handleSpeakingStart = async () => {
    if (!validateSharedSetup()) return;

    setOpeningQuestion("");
    setDisplayedText({}); // Reset displayed text to start fresh animations
    setChatLog([
      { sender: "llm", text: "Hello!" },
      { sender: "llm", text: "Let's practice speaking." },
    ]);
    setStep("chatting");
    setAwaitingQuestionChoice(false);
    setLastQuestionIndexForConfirmation(null);

    const question = await getOpeningQuestion("speaking");
    setOpeningQuestion(question);
    setChatLog((prev) => [...prev, { sender: "llm", text: question, kind: "question" }]);
  };

  const handleWritingStart = async () => {
    if (!validateSharedSetup()) return;

    if (selectedComponents.length === 0) {
      alert("練習内容を少なくとも1つ選択してください");
      return;
    }

    if (selectedComponents.includes(VOCAB_COMPONENT)) {
      if (vocabLessonType === "range") {
        const start = parseInt(vocabRangeStart);
        const end = parseInt(vocabRangeEnd);
        if (start < 1 || end > maxLessonsForCategory || start > end) {
          alert(`レッスン番号は1～${maxLessonsForCategory}の範囲で、開始≤終了となるように入力してください`);
          return;
        }
      } else if (vocabIndividualLessons.length === 0) {
        alert("少なくとも1つの単語レッスンを選択してください");
        return;
      }
    }

    const testPath = getTestPath();
    if (testPath) {
      navigate(testPath);
      return;
    }

    setOpeningQuestion("");
    setDisplayedText({}); // Reset displayed text to start fresh animations
    setChatLog([
      { sender: "llm", text: "Hello!" },
      { sender: "llm", text: "Let's practice writing." },
    ]);
    setLessonStartTime(Date.now());
    setTimeElapsed(0);
    setCurrentComponent(0);
    setStep("chatting");
    setAwaitingQuestionChoice(false);
    setLastQuestionIndexForConfirmation(null);

    const question = await getOpeningQuestion("writing");
    setOpeningQuestion(question);
    setChatLog((prev) => [...prev, { sender: "llm", text: question, kind: "question" }]);
  };

  // Choice screen
  if (mode === "choice") {
    const isWriting = practiceMode === "writing";
    const vocabCategories = Object.entries(CATEGORIES).filter(([key]) =>
      key.includes("word") || key.includes("idioms") || key.includes("business")
    );
    const allLessons = generateLessonNumbers();

    return (
      <>
        {/* Page styles are embedded here for single-file portability */}
        <style>{`
          :root{
            --bg: transparent;
            --card-bg: linear-gradient(180deg, rgba(250, 252, 255, 0.98), rgba(237, 243, 250, 0.96));
            --muted: #60738f;
            --accent-a: #1f4f91;
            --accent-b: #4a78bd;
            --accent-c: #6f87a9;
            --radius: 16px;
            --container-max: 900px;
          }
          *{box-sizing:border-box}
          .disclaimer{
            position:fixed;
            top:0;
            left:0;
            right:0;
            background: #fff7c2;
            border-bottom: 1px solid #f5d36b;
            color:#6b4a00;
            padding:10px 16px;
            text-align:center;
            z-index:60;
            font-size:14px;
          }
          @media (max-width: 480px) {
            .disclaimer {
              padding: 6px 12px;   /* ← 高さが小さくなる */
              font-size: 13px;     /*（オプション）文字も少し小さく */
            }
          }
          .app-container{
            min-height:100vh;
            display:flex;
            align-items:flex-start;
            justify-content:center;
            padding: 36px 20px 60px;
            background: transparent;
          }
          .card{
            width:100%;
            max-width:var(--container-max);
            background:var(--card-bg);
            border-radius:var(--radius);
            border: 1px solid rgba(125, 151, 191, 0.22);
            box-shadow: 0 20px 55px rgba(4, 10, 24, 0.24);
            padding:32px;
            text-align:center;
          }
          .choice-stack {
            width: 100%;
            max-width: var(--container-max);
          }
          .choice-stack .card {
            max-width: none;
          }
          h1{margin:0 0 8px 0;font-size:28px;color:#0f1d35}
          p.lead{color:var(--muted);margin:0 0 18px 0}
          .about-section {
            margin-bottom: 24px;
            padding: 24px;
            background: #ffffff;
            border: 1px solid rgba(209, 213, 219, 0.8);
            border-radius: 16px;
            box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
          }
          .about-heading {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 14px;
            margin-bottom: 16px;
          }
          .about-logo {
            width: 52px;
            height: 52px;
            border-radius: 10px;
            object-fit: cover;
            flex: 0 0 auto;
          }
          .about-copy {
            max-width: 760px;
            margin: 0 auto;
            color: #334155;
            font-size: 16px;
            line-height: 1.8;
            text-align: center;
          }

          .options{
            display:grid;
            grid-template-columns:1fr;
            gap:18px;
            margin:26px 0;
          }
          @media(min-width:720px){
            .options{grid-template-columns:1fr 1fr}
          }

          .btn{
            border:1px solid #d1d5db;
            padding:0;
            cursor:pointer;
            display:inline-flex;
            align-items:center;
            justify-content:center;
            border-radius:18px;
            font-weight:700;
            transition: transform .14s cubic-bezier(.2,.9,.2,1), box-shadow .14s ease, border-color .14s ease, background .14s ease;
          }
          .btn:active{transform:translateY(1px)}
          .btn-primary{
            height:80px;
            background:linear-gradient(90deg,#4f46e5,#06b6d4);
            color:#ffffff;
            box-shadow:0 12px 30px rgba(79,70,229,0.18);
            font-size:18px;
            border:none;
          }
          .btn-secondary{
            height:80px;
            background:linear-gradient(90deg,#4f46e5,#06b6d4);
            color:#ffffff;
            box-shadow:0 12px 30px rgba(79,70,229,0.18);
            font-size:18px;
            border:none;
          }
          .btn:hover{
            transform:translateY(-6px);
            box-shadow:0 18px 36px rgba(31,79,145,0.22);
            border-color:transparent;
          }
          .back-row{display:flex;justify-content:center;margin-top:8px}
          .btn-accent{
            padding:10px 18px;
            background:white;
            border:1px solid #d1d5db;
            color:#374151;
            border-radius:12px;
            box-shadow: 0 4px 12px rgba(15,23,42,0.08);
            font-weight:600;
          }
          .home-setup-card{text-align:left}
          .home-setup-header{text-align:center;margin-bottom:24px}
          .setup-grid{display:grid;grid-template-columns:1fr;gap:18px}
          @media(min-width:860px){.setup-grid{grid-template-columns:1fr 1fr}}
          .setup-section{background:#ffffff;border:1px solid rgba(209,213,219,.82);border-radius:16px;padding:18px;box-shadow:0 10px 24px rgba(15,23,42,0.08)}
          .setup-section.full{grid-column:1 / -1}
          .setup-section h2{font-size:18px;margin:0 0 10px;color:#10213c}
          .levels,.option-grid,.dur-grid,.mode-grid{display:grid;gap:10px}
          .levels{grid-template-columns:repeat(3,1fr)}
          .option-grid,.mode-grid{grid-template-columns:repeat(2,1fr)}
          .dur-grid{grid-template-columns:repeat(3,1fr)}
          @media(min-width:720px){
            .levels{grid-template-columns:repeat(6,1fr)}
            .option-grid.wide{grid-template-columns:repeat(3,1fr)}
            .dur-grid{grid-template-columns:repeat(6,1fr)}
          }
          .mode-btn,.level-btn,.option-btn,.dur-btn,.cat-btn{padding:12px;border-radius:18px;border:1px solid #d1d5db;background:#ffffff;cursor:pointer;transition:transform .14s cubic-bezier(.2,.9,.2,1), box-shadow .14s ease, border-color .14s ease, background .14s ease;display:flex;align-items:center;justify-content:center;text-align:center;box-shadow:0 4px 12px rgba(15,23,42,0.08)}
          .mode-btn{min-height:64px;font-size:18px;font-weight:800}
          .level-btn{flex-direction:column;min-height:68px}
          .mode-btn.active,.level-btn.active,.option-btn.active,.dur-btn.active,.cat-btn.active{background:linear-gradient(90deg,#4f46e5,#06b6d4);color:white;box-shadow:0 12px 30px rgba(79,70,229,0.18);border-color:transparent;transform:scale(1.02)}
          .mode-btn:hover,.level-btn:hover,.option-btn:hover,.dur-btn:hover,.cat-btn:hover{transform:translateY(-6px);box-shadow:0 18px 36px rgba(15,23,42,0.12);border-color:#b8c4d6}
          .mode-btn.active:hover,.level-btn.active:hover,.option-btn.active:hover,.dur-btn.active:hover,.cat-btn.active:hover{box-shadow:0 18px 36px rgba(79,70,229,0.22);border-color:transparent}
          .input-text{width:100%;padding:10px;border-radius:8px;border:1px solid #e6e9ef}
          .cat-list{display:grid;grid-template-columns:1fr;gap:10px}
          @media(min-width:720px){.cat-list{grid-template-columns:repeat(2,1fr)}}
          .cat-btn{align-items:flex-start;flex-direction:column}
          .lesson-method{display:flex;gap:16px;flex-wrap:wrap;margin:12px 0}
          .range-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
          .grid-lessons{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-height:220px;overflow:auto;padding:8px;background:#f8fafc;border-radius:8px;border:1px solid #eef2f6}
          .home-actions{display:flex;justify-content:center;margin-top:22px}
          .home-start-btn{min-height:48px;padding:0 22px;background:linear-gradient(90deg,#4f46e5,#06b6d4);color:white;border:none;border-radius:12px;box-shadow:0 12px 30px rgba(79,70,229,0.18);font-size:16px;font-weight:800;cursor:pointer}
          @media (max-width: 720px) {
            .about-section { padding: 18px; }
            .about-heading { flex-direction: column; gap: 10px; }
            .about-copy { font-size: 14px; text-align: left; }
          }

        `}</style>

     
        <main className={containerClass}>
          <div className="choice-stack">
            <section className="about-section" aria-labelledby="speakwise-about-title">
              <div className="about-heading">
                <img className="about-logo" src="/images/speakwise.png" alt="SpeakWiseAI" />
                <h2
                  id="speakwise-about-title"
                  style={{
                    fontSize: 32,
                    fontWeight: 900,
                    textAlign: "center",
                    margin: 0,
                    color: "#1f2937",
                  }}
                >
                  SpeakWiseAI
                </h2>
              </div>

              <p className="about-copy">
                SpeakWiseAIは、AIと英語でやり取りしながら、
                <strong>話す力と書く力を実践的に伸ばす</strong>ための英語学習アプリです。
                レベルや興味分野に合わせて、自然な会話練習やライティング練習を始められます。
              </p>

              <p className="about-copy" style={{ marginTop: 18, fontWeight: 700, color: "#173a71" }}>
                まずは、今日練習したいスキルを選んでください。
              </p>
            </section>

            <div className={`${contentClass} home-setup-card`}>
              <div className="home-setup-header">
                <h1>学習設定</h1>
                <p className="lead">練習したいスキル、レベル、トピック、テスト対策を選んで始めましょう。</p>
              </div>

              <div className="setup-grid">
                <section className="setup-section full">
                  <h2>学習</h2>
                  <div className="mode-grid">
                    <button
                      type="button"
                      onClick={() => handlePracticeModeSelect("speaking")}
                      className={`mode-btn ${practiceMode === "speaking" ? "active" : ""}`}
                      aria-pressed={practiceMode === "speaking"}
                    >
                      スピーキング
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePracticeModeSelect("writing")}
                      className={`mode-btn ${practiceMode === "writing" ? "active" : ""}`}
                      aria-pressed={practiceMode === "writing"}
                    >
                      ライティング
                    </button>
                  </div>
                </section>

                <section className="setup-section full">
                  <h2>英語レベル</h2>
                  <div className="levels">
                    {LEVELS.map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => {
                          setLevel(lvl);
                          setLevelConfirmed(true);
                        }}
                        className={`level-btn ${level === lvl ? "active" : ""}`}
                      >
                        <div style={{ fontSize: 18, marginBottom: 4, fontWeight: 800 }}>{lvl}</div>
                        <div style={{ fontSize: 12, opacity: 0.82 }}>
                          {lvl === "A1" && "初級"}
                          {lvl === "A2" && "初中級"}
                          {lvl === "B1" && "中級"}
                          {lvl === "B2" && "中上級"}
                          {lvl === "C1" && "上級"}
                          {lvl === "C2" && "最上級"}
                        </div>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="setup-section full">
                  <h2>興味のあるトピック</h2>
                  <div className="option-grid wide">
                    {TOPICS.map((topic) => (
                      <button
                        key={topic}
                        type="button"
                        onClick={() => handleTopicToggle(topic)}
                        className={`option-btn ${selectedTopics.includes(topic) ? "active" : ""}`}
                        aria-pressed={selectedTopics.includes(topic)}
                      >
                        <span style={{ fontWeight: 700 }}>{topic}</span>
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>その他のトピック</label>
                    <input
                      type="text"
                      value={customTopic}
                      onChange={(e) => setCustomTopic(e.target.value)}
                      placeholder="例: 留学、研究発表、旅行、ニュース..."
                      className="input-text"
                    />
                  </div>
                </section>

                <section className="setup-section full">
                  <h2>対策しているテスト</h2>
                  <div className="option-grid wide">
                    {TESTS.map((test) => (
                      <button
                        key={test}
                        type="button"
                        onClick={() => handleTestToggle(test)}
                        className={`option-btn ${selectedTests.includes(test) ? "active" : ""}`}
                        aria-pressed={selectedTests.includes(test)}
                      >
                        <span style={{ fontWeight: 700 }}>{test}</span>
                      </button>
                    ))}
                  </div>
                </section>

                {isWriting && (
                  <>
                    <section className="setup-section">
                      <h2>練習時間</h2>
                      <div className="dur-grid">
                        {[5, 10, 15, 20, 25, 30].map((min) => (
                          <button
                            key={min}
                            type="button"
                            onClick={() => setSelectedDuration(min.toString())}
                            className={`dur-btn ${selectedDuration === min.toString() ? "active" : ""}`}
                          >
                            <span style={{ fontWeight: 800 }}>{min}分</span>
                          </button>
                        ))}
                      </div>
                    </section>

                    <section className="setup-section full">
                      <h2>ライティングに含める練習</h2>
                      <div className="option-grid wide">
                        {COMPONENTS.filter((component) => component !== "会話練習").map((component) => (
                          <button
                            key={component}
                            type="button"
                            onClick={() => handleComponentToggle(component)}
                            className={`option-btn ${selectedComponents.includes(component) ? "active" : ""}`}
                            aria-pressed={selectedComponents.includes(component)}
                          >
                            <span style={{ fontWeight: 700 }}>{component}</span>
                          </button>
                        ))}
                      </div>
                    </section>

                    {selectedComponents.includes(VOCAB_COMPONENT) && (
                      <section className="setup-section full">
                        <h2>単語練習のカテゴリー</h2>
                        <div className="cat-list">
                          {vocabCategories.map(([key, value]) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => {
                                setVocabCategory(key);
                                setVocabLessonType("range");
                                setVocabRangeStart("1");
                                setVocabRangeEnd("5");
                                setVocabIndividualLessons(["1"]);
                              }}
                              className={`cat-btn ${vocabCategory === key ? "active" : ""}`}
                            >
                              <div style={{ fontWeight: 800 }}>{value}</div>
                              <div style={{ fontSize: 13, opacity: 0.8 }}>{LESSON_COUNTS[key]}レッスン</div>
                            </button>
                          ))}
                        </div>

                        <div className="lesson-method">
                          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input type="radio" checked={vocabLessonType === "range"} onChange={() => setVocabLessonType("range")} />
                            <span style={{ fontWeight: 700 }}>範囲で選択</span>
                          </label>
                          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <input type="radio" checked={vocabLessonType === "individual"} onChange={() => setVocabLessonType("individual")} />
                            <span style={{ fontWeight: 700 }}>個別に選択</span>
                          </label>
                        </div>

                        {vocabLessonType === "range" ? (
                          <div className="range-grid">
                            <div>
                              <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>開始レッスン</label>
                              <input type="number" min={1} max={maxLessonsForCategory} value={vocabRangeStart} onChange={(e) => setVocabRangeStart(e.target.value)} className="input-text" />
                            </div>
                            <div>
                              <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>終了レッスン</label>
                              <input type="number" min={1} max={maxLessonsForCategory} value={vocabRangeEnd} onChange={(e) => setVocabRangeEnd(e.target.value)} className="input-text" />
                            </div>
                          </div>
                        ) : (
                          <div className="grid-lessons">
                            {allLessons.map((lesson) => (
                              <label key={lesson} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <input type="checkbox" checked={vocabIndividualLessons.includes(lesson)} onChange={() => handleVocabLessonToggle(lesson)} />
                                <span style={{ fontSize: 13 }}>L{lesson}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </section>
                    )}
                  </>
                )}
              </div>

              <div className="home-actions">
                <button type="button" onClick={handleHomeStart} className="home-start-btn">
                  SpeakWiseAIとレッスンを開始する
                </button>
              </div>

              <p style={{ marginTop: 18, textAlign: "center" }}>
                ⚠️ 本機能は現在まだ開発実験段階であるため、機能が不安定な場合があります。
                <br/>会話の内容は保存されず、プライバシーは保護されます。
              </p>
            </div>
          </div>
        </main>
      </>
    );
  }

  if (step === "setup") {
    const isWriting = mode === "lesson";
    const vocabCategories = Object.entries(CATEGORIES).filter(([key]) =>
      key.includes("word") || key.includes("idioms") || key.includes("business")
    );
    const allLessons = generateLessonNumbers();

    return (
      <>
        <style>{`
          .app-container{padding:36px 20px 60px}
          .card{padding:28px;text-align:left}
          .setup-header{text-align:center;margin-bottom:24px}
          .setup-grid{display:grid;grid-template-columns:1fr;gap:18px}
          @media(min-width:860px){.setup-grid{grid-template-columns:1fr 1fr}}
          .setup-section{background:#ffffff;border:1px solid rgba(209,213,219,.82);border-radius:16px;padding:18px;box-shadow:0 10px 24px rgba(15,23,42,0.08)}
          .setup-section.full{grid-column:1 / -1}
          .setup-section h2{font-size:18px;margin:0 0 10px;color:#10213c}
          .levels,.option-grid,.dur-grid{display:grid;gap:10px}
          .levels{grid-template-columns:repeat(3,1fr)}
          .option-grid{grid-template-columns:repeat(2,1fr)}
          .dur-grid{grid-template-columns:repeat(3,1fr)}
          @media(min-width:720px){
            .levels{grid-template-columns:repeat(6,1fr)}
            .option-grid.wide{grid-template-columns:repeat(3,1fr)}
            .dur-grid{grid-template-columns:repeat(6,1fr)}
          }
          .level-btn,.option-btn,.dur-btn,.cat-btn{padding:12px;border-radius:18px;border:1px solid #d1d5db;background:#ffffff;cursor:pointer;transition:transform .14s cubic-bezier(.2,.9,.2,1), box-shadow .14s ease, border-color .14s ease, background .14s ease;display:flex;align-items:center;justify-content:center;text-align:center;box-shadow:0 4px 12px rgba(15,23,42,0.08)}
          .level-btn{flex-direction:column;min-height:68px}
          .level-btn.active,.option-btn.active,.dur-btn.active,.cat-btn.active{background:linear-gradient(180deg,#1f4f91,#4a78bd);color:white;box-shadow:0 12px 30px rgba(31,79,145,0.16);transform:scale(1.02)}
          .level-btn:hover,.option-btn:hover,.dur-btn:hover,.cat-btn:hover{transform:translateY(-6px);box-shadow:0 18px 36px rgba(15,23,42,0.12);border-color:#b8c4d6}
          .level-btn.active:hover,.option-btn.active:hover,.dur-btn.active:hover,.cat-btn.active:hover{box-shadow:0 18px 36px rgba(31,79,145,0.18);border-color:#4a78bd}
          .input-text{width:100%;padding:10px;border-radius:8px;border:1px solid #e6e9ef}
          .cat-list{display:grid;grid-template-columns:1fr;gap:10px}
          @media(min-width:720px){.cat-list{grid-template-columns:repeat(2,1fr)}}
          .cat-btn{align-items:flex-start;flex-direction:column}
          .lesson-method{display:flex;gap:16px;flex-wrap:wrap;margin:12px 0}
          .range-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
          .grid-lessons{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-height:220px;overflow:auto;padding:8px;background:#f8fafc;border-radius:8px;border:1px solid #eef2f6}
          .setup-actions{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:22px}
          .btn-accent{padding:10px 18px;background:white;border:1px solid #d1d5db;color:#374151;border-radius:12px;box-shadow:0 4px 12px rgba(15,23,42,0.08);font-weight:700;cursor:pointer}
          .btn-primary{min-height:48px;padding:0 22px;background:linear-gradient(90deg,#4f46e5,#06b6d4);color:white;border:none;border-radius:12px;box-shadow:0 12px 30px rgba(79,70,229,0.18);font-size:16px;font-weight:800;cursor:pointer}
          .lead{color:#60738f}
        `}</style>

        <main className={containerClass}>
          <div className={contentClass}>
            <div className="setup-header">
              <h1 style={{ fontSize: 26, marginBottom: 6 }}>
                {isWriting ? "ライティング練習の設定" : "スピーキング練習の設定"}
              </h1>
              <p className="lead" style={{ margin: 0 }}>
                レベル、トピック、練習内容をこの画面でまとめて選べます。
              </p>
            </div>

            <div className="setup-grid">
              <section className="setup-section full">
                <h2>英語レベル</h2>
                <div className="levels">
                  {["A1", "A2", "B1", "B2", "C1", "C2"].map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => {
                        setLevel(lvl);
                        setLevelConfirmed(true);
                      }}
                      className={`level-btn ${level === lvl ? "active" : ""}`}
                    >
                      <div style={{ fontSize: 18, marginBottom: 4, fontWeight: 800 }}>{lvl}</div>
                      <div style={{ fontSize: 12, opacity: 0.82 }}>
                        {lvl === "A1" && "初級"}
                        {lvl === "A2" && "初中級"}
                        {lvl === "B1" && "中級"}
                        {lvl === "B2" && "中上級"}
                        {lvl === "C1" && "上級"}
                        {lvl === "C2" && "最上級"}
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="setup-section full">
                <h2>興味のあるトピック</h2>
                <div className="option-grid wide">
                  {TOPICS.map((topic) => (
                    <button
                      key={topic}
                      onClick={() => handleTopicToggle(topic)}
                      className={`option-btn ${selectedTopics.includes(topic) ? "active" : ""}`}
                      aria-pressed={selectedTopics.includes(topic)}
                    >
                      <span style={{ fontWeight: 700 }}>{topic}</span>
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 12 }}>
                  <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>その他のトピック</label>
                  <input
                    type="text"
                    value={customTopic}
                    onChange={(e) => setCustomTopic(e.target.value)}
                    placeholder="例: 留学、研究発表、旅行、ニュース..."
                    className="input-text"
                  />
                </div>
              </section>

              {isWriting && (
                <>
                  <section className="setup-section">
                    <h2>対策しているテスト</h2>
                    <div className="option-grid">
                      {TESTS.map((test) => (
                        <button
                          key={test}
                          onClick={() => handleTestToggle(test)}
                          className={`option-btn ${selectedTests.includes(test) ? "active" : ""}`}
                          aria-pressed={selectedTests.includes(test)}
                        >
                          <span style={{ fontWeight: 700 }}>{test}</span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="setup-section">
                    <h2>練習時間</h2>
                    <div className="dur-grid">
                      {[5, 10, 15, 20, 25, 30].map((min) => (
                        <button
                          key={min}
                          onClick={() => setSelectedDuration(min.toString())}
                          className={`dur-btn ${selectedDuration === min.toString() ? "active" : ""}`}
                        >
                          <span style={{ fontWeight: 800 }}>{min}分</span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="setup-section full">
                    <h2>ライティングに含める練習</h2>
                    <div className="option-grid wide">
                      {COMPONENTS.filter((component) => component !== "会話練習").map((component) => (
                        <button
                          key={component}
                          onClick={() => handleComponentToggle(component)}
                          className={`option-btn ${selectedComponents.includes(component) ? "active" : ""}`}
                          aria-pressed={selectedComponents.includes(component)}
                        >
                          <span style={{ fontWeight: 700 }}>{component}</span>
                        </button>
                      ))}
                    </div>
                  </section>

                  {selectedComponents.includes(VOCAB_COMPONENT) && (
                    <section className="setup-section full">
                      <h2>単語練習のカテゴリー</h2>
                      <div className="cat-list">
                        {vocabCategories.map(([key, value]) => (
                          <button
                            key={key}
                            onClick={() => {
                              setVocabCategory(key);
                              setVocabLessonType("range");
                              setVocabRangeStart("1");
                              setVocabRangeEnd("5");
                              setVocabIndividualLessons(["1"]);
                            }}
                            className={`cat-btn ${vocabCategory === key ? "active" : ""}`}
                          >
                            <div style={{ fontWeight: 800 }}>{value}</div>
                            <div style={{ fontSize: 13, opacity: 0.8 }}>{LESSON_COUNTS[key]}レッスン</div>
                          </button>
                        ))}
                      </div>

                      <div className="lesson-method">
                        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input type="radio" checked={vocabLessonType === "range"} onChange={() => setVocabLessonType("range")} />
                          <span style={{ fontWeight: 700 }}>範囲で選択</span>
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input type="radio" checked={vocabLessonType === "individual"} onChange={() => setVocabLessonType("individual")} />
                          <span style={{ fontWeight: 700 }}>個別に選択</span>
                        </label>
                      </div>

                      {vocabLessonType === "range" ? (
                        <div className="range-grid">
                          <div>
                            <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>開始レッスン</label>
                            <input type="number" min={1} max={maxLessonsForCategory} value={vocabRangeStart} onChange={(e) => setVocabRangeStart(e.target.value)} className="input-text" />
                          </div>
                          <div>
                            <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>終了レッスン</label>
                            <input type="number" min={1} max={maxLessonsForCategory} value={vocabRangeEnd} onChange={(e) => setVocabRangeEnd(e.target.value)} className="input-text" />
                          </div>
                        </div>
                      ) : (
                        <div className="grid-lessons">
                          {allLessons.map((lesson) => (
                            <label key={lesson} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <input type="checkbox" checked={vocabIndividualLessons.includes(lesson)} onChange={() => handleVocabLessonToggle(lesson)} />
                              <span style={{ fontSize: 13 }}>L{lesson}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </section>
                  )}
                </>
              )}
            </div>

            <div className="setup-actions">
              <button onClick={() => setMode("choice")} className="btn-accent">← 戻る</button>
              <button onClick={isWriting ? handleWritingStart : handleSpeakingStart} className="btn-primary">
                SpeakWiseAIとレッスンを開始する
              </button>
            </div>
          </div>
        </main>
      </>
    );
  }

  // Level selection 
  if (step === "level") {
    return (
      <>
        <style>{`
          .app-container{padding:110px 20px 60px}
          .card{padding:28px}
          .levels{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0}
          @media(min-width:720px){.levels{grid-template-columns:repeat(6,1fr)}}
          .level-btn, .option-btn, .dur-btn, .cat-btn{padding:18px;border-radius:12px;border:1px solid #e6e9ef;background:white;cursor:pointer;transition:transform .14s ease, box-shadow .14s ease;display:flex;flex-direction:column;align-items:center}
          .level-btn.active, .option-btn.active{background:linear-gradient(180deg,#1f4f91,#4a78bd);color:white;box-shadow:0 12px 30px rgba(31,79,145,0.18);transform:scale(1.03)}
          .actions-row{display:flex;gap:12px;justify-content:center;margin-top:16px;flex-wrap:wrap}
          .next-btn{padding:12px 20px;border-radius:12px;background:#efefef;border:none;cursor:pointer}
          .selected-display{margin-bottom:12px}
          .selected-display .label{color:#374151}
          .selected-display .items{font-weight:800;color:#3730a3}
        `}</style>


        <main className={containerClass}>
          <div className={contentClass}>
            <h1 style={{ fontSize: 22, marginBottom: 6 }}>英語レベルの設定</h1>
            <p className="lead">あなたの現在の英語レベルを選んでください</p>

            <div className="selected-display">
              <span className="label">選択中： </span>
              <span className="items">{level || "未選択"}</span>
            </div>

            <div className="levels">
              {["A1", "A2", "B1", "B2", "C1", "C2"].map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => {
                    setLevel(lvl);
                    setLevelConfirmed(true);
                  }}
                  className={`level-btn ${level === lvl ? "active" : ""}`}
                >
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{lvl}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {lvl === "A1" && "初級"}
                    {lvl === "A2" && "初中級"}
                    {lvl === "B1" && "中級"}
                    {lvl === "B2" && "中上級"}
                    {lvl === "C1" && "上級"}
                    {lvl === "C2" && "最上級"}
                  </div>
                </button>
              ))}
            </div>

            <div className="actions-row">
              <button
                onClick={() => setMode("choice")}
                className="btn-accent"
              >
                ← 戻る
              </button>
              <button
                onClick={() => {
                  if (!levelConfirmed) {
                    alert("レベルを選択してください（選択中が表示されます）");
                    return;
                  }
                  setStep("topic");
                }}
                className={levelConfirmed ? btnPrimary : "btn-accent"}
                style={levelConfirmed ? undefined : { opacity: 0.8 }}
              >
                次へ →
              </button>
            </div>
          </div>
        </main>
      </>
    );
  }

  // Topic selection (updated to use option buttons + selected summary)
  if (step === "topic") {
    return (
      <>
        <style>{`
          .form-list{display:flex;flex-direction:column;gap:10px;margin-bottom:14px}
          .option-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:18px 0}
          @media(min-width:720px){.option-grid{grid-template-columns:repeat(4,1fr)}}
          .option-btn{padding:12px;border-radius:10px;border:1px solid #e6e9ef;background:white;cursor:pointer;display:flex;align-items:center;gap:8px;justify-content:center}
          .option-btn.active{background:linear-gradient(180deg,#1f4f91,#4a78bd);color:white;box-shadow:0 12px 30px rgba(31,79,145,0.14);transform:scale(1.02)}
          .input-text{width:100%;padding:10px;border-radius:8px;border:1px solid #e6e9ef}
          .actions-row{display:flex;gap:12px;justify-content:center;margin-top:8px}
          .selected-line{margin-bottom:12px}
        `}</style>

        <main className={containerClass} style={{ paddingTop: '92px' }}>
          <div className={contentClass}>
            <h1 style={{ fontSize: 22 }}>興味の設定</h1>
            <p className="lead">興味のあるトピックを選択してください。（＊複数選択可能です）</p>

            <div className="selected-line">
              <span style={{ color: "#374151" }}>選択中： </span>
              <span style={{ fontWeight: 800, color: "#3730a3" }}>
                {selectedTopics.length > 0 ? selectedTopics.join('・') : '未選択'}
              </span>
            </div>

            <div className="option-grid">
              {TOPICS.map((topic) => (
                <button
                  key={topic}
                  onClick={() => handleTopicToggle(topic)}
                  className={`option-btn ${selectedTopics.includes(topic) ? 'active' : ''}`}
                  aria-pressed={selectedTopics.includes(topic)}
                >
                  <span style={{ fontWeight: 600 }}>{topic}</span>
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>その他のトピック (自由記入):</label>
              <input
                type="text"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="カスタムトピックを入力..."
                className="input-text"
              />
            </div>

            <div className="actions-row">
              <button onClick={() => { setLevel(""); setLevelConfirmed(false); setStep("level"); }} className="btn-accent">← 戻る</button>
              <button onClick={() => {
                if (selectedTopics.length === 0 && !customTopic) {
                  alert("少なくとも1つのトピックを選択してください");
                  return;
                }
                if (mode === "casual") {
                  setStep("confirm");
                } else {
                  setStep("test");
                }
              }} className={btnPrimary}>次へ →</button>
            </div>
          </div>
        </main>
      </>
    );
  }

  // Casual helper unchanged (kept here for context)
  const handleCasualStart = async () => {
    const casualPrompt = `You are a friendly English conversation partner. Start the conversation with a warm greeting and ask the user a simple, open-ended question to get them talking. For example, you could ask "How are you today?" or "What have you been up to?" based on their interests (${selectedTopics.join(", ")}). Keep the tone natural, friendly, and encouraging. The user is at level ${level}.`;

    setChatLog([]);
    setOpeningQuestion("");
    setStep("chatting");

    // Send the casual start prompt to AI
    setTimeout(() => {
      handleCasualPromptStart(casualPrompt);
    }, 50);
  };

  // Casual confirm (unchanged)
  if (mode === "casual" && step === "confirm") {
    return (
      <>
        <style>{`
          .summary{max-width:720px;margin:0 auto}
          .summary-box{background:#e8f0fb;padding:14px;border-radius:10px;margin-bottom:12px}
          .summary-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
          .tag{background:#d6e4f7;padding:6px 10px;border-radius:999px;font-size:13px}
          .controls{display:flex;gap:10px;justify-content:center}
                    .modern-orange-btn {
            background: linear-gradient(135deg, #1f4f91, #4a78bd);
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 10px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s;
            box-shadow: 0 4px 12px rgba(31, 79, 145, 0.28);
          }

          .modern-orange-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(31, 79, 145, 0.4);
            opacity: 0.95;
          }

          .modern-orange-btn:active {
            transform: translateY(0);
            box-shadow: 0 3px 8px rgba(31, 79, 145, 0.32);
            opacity: 0.9;
          }
        `}</style>

        <main style={{ paddingTop: 92 }} className="app-container">
          <div className="card summary">
            <h1 style={{ fontSize: 22 }}>設定の確認</h1>

            <div className="summary-box">
              <div style={{ marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontWeight: 800 }}>英語レベル:</h3>
                <p style={{ margin: "6px 0 0", fontSize: 18 }}>{level}</p>
              </div>
              <div style={{ marginTop: 10 }}>
                <h3 style={{ margin: 0, fontWeight: 800 }}>トピック:</h3>
                <div className="summary-tags">
                  {topicsToPass.map((topic) => (
                    <div key={topic} className="tag">{topic}</div>
                  ))}
                </div>
              </div>
            </div>

            <div className="controls">
              <button onClick={() => setStep("topic")} className="btn-accent">← 編集</button>
              <button onClick={handleCasualStart} className="modern-orange-btn">会話を開始する</button>
            </div>
          </div>
        </main>
      </>
    );
  }

  // Test selection (updated to option buttons + selected summary)
  if (mode === "lesson" && step === "test") {
    return (
      <>
        <style>{`
          .list-col{display:flex;flex-direction:column;gap:10px;margin-bottom:14px}
          .option-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:18px 0}
          @media(min-width:720px){.option-grid{grid-template-columns:repeat(3,1fr)}}
          .option-btn{padding:12px;border-radius:10px;border:1px solid #eef2f6;background:white;cursor:pointer;display:flex;align-items:center;justify-content:center}
          .option-btn.active{background:linear-gradient(180deg,#1f4f91,#4a78bd);color:white;box-shadow:0 12px 30px rgba(31,79,145,0.14)}
          .small-input{width:100%;padding:10px;border-radius:8px;border:1px solid #e6e9ef}
          .controls{display:flex;gap:10px;justify-content:center}
          .selected-line{margin-bottom:12px}
        `}</style>

        <main className={containerClass} style={{ paddingTop: '92px' }}>
          <div className={contentClass}>
            <h1 style={{ fontSize: 22 }}>英語試験への対策の設定</h1>
            <p className="lead">受験予定の英語試験を選択してください （＊複数選択可能です）</p>

            <div className="selected-line">
              <span style={{ color: "#374151" }}>選択中： </span>
              <span style={{ fontWeight: 800, color: "#3730a3" }}>
                {selectedTests.length > 0 ? selectedTests.join('・') : '未選択'}
              </span>
            </div>

            <div className="option-grid">
              {TESTS.map((test) => (
                <button
                  key={test}
                  onClick={() => handleTestToggle(test)}
                  className={`option-btn ${selectedTests.includes(test) ? 'active' : ''}`}
                  aria-pressed={selectedTests.includes(test)}
                >
                  <span style={{ fontWeight: 600 }}>{test}</span>
                </button>
              ))}
            </div>

            {selectedTests.includes("Other") && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>その他の試験名:</label>
                <input
                  type="text"
                  value={customTest}
                  onChange={(e) => setCustomTest(e.target.value)}
                  placeholder="試験名を入力..."
                  className="small-input"
                />
              </div>
            )}

            <div className="controls">
              <button onClick={() => setStep("topic")} className="btn-accent">← 戻る</button>
              <button onClick={() => {
                if (selectedTests.length === 0) {
                  alert("少なくとも1つの試験を選択してください");
                  return;
                }
                setStep("skills");
              }} className={btnPrimary}>次へ →</button>
            </div>
          </div>
        </main>
      </>
    );
  }

  // Skills selection (updated to option buttons + summary)
  if (mode === "lesson" && step === "skills") {
    return (
      <>
        <style>{`
          .list-col{display:flex;flex-direction:column;gap:10px;margin-bottom:14px}
          .option-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:18px 0}
          @media(min-width:720px){.option-grid{grid-template-columns:repeat(3,1fr)}}
          .option-btn{padding:12px;border-radius:10px;border:1px solid #eef2f6;background:white;cursor:pointer;display:flex;align-items:center;justify-content:center}
          .option-btn.active{background:linear-gradient(180deg,#1f4f91,#4a78bd);color:white;box-shadow:0 12px 30px rgba(31,79,145,0.14)}
          .controls{display:flex;gap:10px;justify-content:center}
          .selected-line{margin-bottom:12px}
        `}</style>

        <main className={containerClass} style={{ paddingTop: '92px' }}>
          <div className={contentClass}>
            <h1 style={{ fontSize: 22 }}>伸ばしたいスキルを選択してください</h1>

            <div className="selected-line">
              <span style={{ color: "#374151" }}>選択中： </span>
              <span style={{ fontWeight: 800, color: "#3730a3" }}>
                {selectedSkills.length > 0 ? selectedSkills.join('・') : '未選択'}
              </span>
            </div>

            <div className="option-grid">
              {SKILLS.map((skill) => (
                <button
                  key={skill}
                  onClick={() => handleSkillToggle(skill)}
                  className={`option-btn ${selectedSkills.includes(skill) ? 'active' : ''}`}
                  aria-pressed={selectedSkills.includes(skill)}
                >
                  <span style={{ fontWeight: 600 }}>{skill}</span>
                </button>
              ))}
            </div>

            <div className="controls">
              <button onClick={() => setStep("test")} className="btn-accent">← 戻る</button>
              <button onClick={() => {
                if (selectedSkills.length === 0) {
                  alert("少なくとも1つのスキルを選択してください");
                  return;
                }
                setStep("duration");
              }} className={btnPrimary}>次へ →</button>
            </div>
          </div>
        </main>
      </>
    );
  }

  // Duration selection (kept similar, but updated selected display style)
  if (mode === "lesson" && step === "duration") {
    return (
      <>
        <style>{`
          .dur-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
          @media(min-width:720px){.dur-grid{grid-template-columns:repeat(6,1fr)}}
          .dur-btn{padding:16px;border-radius:10px;border:1px solid #e6e9ef;background:#f3f4f6;cursor:pointer}
          .dur-btn.active{background:#355c91;color:white;box-shadow:0 10px 28px rgba(53,92,145,0.16);transform:scale(1.03)}
          .summary-box{background:#eff6ff;padding:12px;border-radius:10px;margin-bottom:12px;text-align:center}
        `}</style>

        <main className={containerClass} style={{ paddingTop: '92px' }}>
          <div className={contentClass}>
            <h1 style={{ fontSize: 22 }}>レッスンの希望時間を選択してください</h1>
            <p className="lead">レッスンに費やしたい時間を選んでください</p>

            <div className="selected-display">
              <span className="label">選択中： </span>
          
              <span className="items" style={{ fontWeight: 800, color: "#3730a3" }}>
                {selectedDuration ? `${selectedDuration}分` : "未選択"}
                <br/>
              </span>
            </div>

            <div className="dur-grid">
              {[5, 10, 15, 20, 25, 30].map((min) => (
                <button
                  key={min}
                  onClick={() => setSelectedDuration(min.toString())}
                  className={`dur-btn ${selectedDuration === min.toString() ? "active" : ""}`}
                >
                  <div style={{ fontSize: 18 }}>{min}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>分</div>
                </button>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
              <button onClick={() => setStep("skills")} className="btn-accent">← 戻る</button>
              <button onClick={() => setStep("components")} className={btnPrimary}>次へ →</button>
            </div>
          </div>
        </main>
      </>
    );
  }

  // Components selection (updated to option buttons + selected summary)
  if (mode === "lesson" && step === "components") {
    return (
      <>
        <style>{`
          .list-col{display:flex;flex-direction:column;gap:10px;margin-bottom:14px}
          .option-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:18px 0}
          @media(min-width:720px){.option-grid{grid-template-columns:repeat(3,1fr)}}
          .option-btn{padding:12px;border-radius:10px;border:1px solid #eef2f6;background:white;cursor:pointer;display:flex;align-items:center;justify-content:center}
          .option-btn.active{background:linear-gradient(180deg,#1f4f91,#4a78bd);color:white;box-shadow:0 12px 30px rgba(31,79,145,0.14)}
          .controls{display:flex;gap:10px;justify-content:center}
          .selected-line{margin-bottom:12px}
        `}</style>

        <main className={containerClass} style={{ paddingTop: '92px' }}>
          <div className={contentClass}>
            <h1 style={{ fontSize: 22 }}>レッスンに含める内容を選択してください</h1>

            <div className="selected-line">
              <span style={{ color: "#374151" }}>選択中： </span>
              <span style={{ fontWeight: 800, color: "#3730a3" }}>
                {selectedComponents.length > 0 ? selectedComponents.join('・') : '未選択'}
              </span>
            </div>

            <div className="option-grid">
              {COMPONENTS.map((component) => (
                <button
                  key={component}
                  onClick={() => handleComponentToggle(component)}
                  className={`option-btn ${selectedComponents.includes(component) ? 'active' : ''}`}
                  aria-pressed={selectedComponents.includes(component)}
                >
                  <span style={{ fontWeight: 600 }}>{component}</span>
                </button>
              ))}
            </div>

            <div className="controls">
              <button onClick={() => setStep("duration")} className="btn-accent">← 戻る</button>
              <button onClick={() => {
                if (selectedComponents.length === 0) {
                  alert("少なくとも1つのコンポーネントを選択してください");
                  return;
                }
                if (selectedComponents.includes(VOCAB_COMPONENT)) {
                  setStep("vocab-category");
                } else {
                  setStep("structure");
                }
              }} className={btnPrimary}>次へ →</button>
            </div>
          </div>
        </main>
      </>
    );
  }

  // Vocab category section kept mostly the same (cat-btn already fits the style)
  if (mode === "lesson" && step === "vocab-category") {
    const vocabCategories = Object.entries(CATEGORIES).filter(([key]) =>
      key.includes("word") || key.includes("idioms") || key.includes("business")
    );

    const allLessons = generateLessonNumbers();

    return (
      <>
        <style>{`
          .vocab-wrap{max-width:960px;margin:0 auto}
          .cat-list{display:flex;flex-direction:column;gap:10px;margin-bottom:12px}
          .cat-btn{padding:12px;border-radius:10px;border:1px solid #e6e9ef;text-align:left;background:white;cursor:pointer}
          .cat-btn.active{background:#2563eb;color:white;box-shadow:0 10px 28px rgba(37,99,235,0.12)}
          .small-box{background:#f8fafc;padding:12px;border-radius:10px}
          .grid-lessons{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;max-height:320px;overflow:auto;padding:8px;background:white;border-radius:8px;border:1px solid #eef2f6}
        `}</style>

        <main className={containerClass} style={{ paddingTop: '92px' }}>
          <div className={`${contentClass} vocab-wrap`}>
            <h1 style={{ fontSize: 22 }}>練習するカテゴリーを選択してください</h1>

            <div className="cat-list">
              {vocabCategories.map(([key, value]) => (
                <button
                  key={key}
                  onClick={() => {
                    setVocabCategory(key);
                    setVocabLessonType("range");
                    setVocabRangeStart("1");
                    setVocabRangeEnd("5");
                    setVocabIndividualLessons(["1"]);
                  }}
                  className={`cat-btn ${vocabCategory === key ? "active" : ""}`}
                >
                  <div style={{ fontWeight: 700 }}>{value}</div>
                  <div style={{ fontSize: 13, opacity: 0.8 }}>({LESSON_COUNTS[key]}レッスン)</div>
                </button>
              ))}
            </div>

            <div className="small-box" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: "0 0 8px 0" }}>レッスン選択方法</h2>

              <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="radio" checked={vocabLessonType === "range"} onChange={() => setVocabLessonType("range")} />
                  <span style={{ fontWeight: 600 }}>範囲で選択 (例: Lesson 1～10)</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="radio" checked={vocabLessonType === "individual"} onChange={() => setVocabLessonType("individual")} />
                  <span style={{ fontWeight: 600 }}>個別に選択</span>
                </label>
              </div>

              {vocabLessonType === "range" && (
                <div style={{ display: "grid", gap: 8 }}>
                  <div>
                    <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>開始レッスン:</label>
                    <input type="number" min={1} max={maxLessonsForCategory} value={vocabRangeStart} onChange={(e) => setVocabRangeStart(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e6e9ef" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>終了レッスン:</label>
                    <input type="number" min={1} max={maxLessonsForCategory} value={vocabRangeEnd} onChange={(e) => setVocabRangeEnd(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e6e9ef" }} />
                  </div>
                  <div style={{ background: "#e6f0ff", padding: 10, borderRadius: 8 }}>
                    <p style={{ margin: 0 }}>選択中: Lesson {vocabRangeStart} ～ {vocabRangeEnd} ({Math.max(0, parseInt(vocabRangeEnd) - parseInt(vocabRangeStart) + 1)}レッスン)</p>
                  </div>
                </div>
              )}

              {vocabLessonType === "individual" && (
                <div>
                  <p style={{ fontWeight: 700 }}>個別にレッスンを選択してください</p>
                  <div className="grid-lessons" style={{ marginBottom: 8 }}>
                    {allLessons.map((lesson) => (
                      <label key={lesson} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="checkbox" checked={vocabIndividualLessons.includes(lesson)} onChange={() => handleVocabLessonToggle(lesson)} />
                        <span style={{ fontSize: 13 }}>L{lesson}</span>
                      </label>
                    ))}
                  </div>
                  <p style={{ color: "#6b7280" }}>選択中: {vocabIndividualLessons.length}レッスン</p>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
              <button onClick={() => setStep("components")} className="btn-accent">← 戻る</button>
              <button onClick={() => {
                if (vocabLessonType === "range") {
                  const start = parseInt(vocabRangeStart);
                  const end = parseInt(vocabRangeEnd);
                  if (start < 1 || end > maxLessonsForCategory || start > end) {
                    alert(`レッスン番号は1～${maxLessonsForCategory}の範囲で、開始≤終了となるように入力してください`);
                    return;
                  }
                } else if (vocabIndividualLessons.length === 0) {
                  alert("少なくとも1つのレッスンを選択してください");
                  return;
                }
                setStep("structure");
              }} className={btnPrimary}>次へ →</button>
            </div>
          </div>
        </main>
      </>
    );
  }



  // Lesson mode - Lesson structure preview
  if (mode === "lesson" && step === "structure") {
    const structure = generateLessonStructure();
    // Keep testsDisplay as an array so we can map it like topicsToPass/selectedSkills
    const testsDisplay = selectedTests.length > 0 ? selectedTests.map(t => t === "Other" ? customTest : t) : [];

    let vocabDisplay = "";
    if (selectedComponents.includes(VOCAB_COMPONENT)) {
      if (vocabLessonType === "range") {
        vocabDisplay = `${CATEGORIES[vocabCategory as keyof typeof CATEGORIES]} - Lesson ${vocabRangeStart} ～ ${vocabRangeEnd}`;
      } else {
        vocabDisplay = `${CATEGORIES[vocabCategory as keyof typeof CATEGORIES]} - ${vocabIndividualLessons.length}レッスン`;
      }
    }

    return (
      <>
        <style>{`
          .summary-grid{display:block;gap:12px}
          @media(min-width:920px){
            .summary-grid{display:flex;align-items:stretch;gap:12px}
            .summary-block, .green-block{flex:1;margin-bottom:0;display:flex;flex-direction:column}
            .summary-block{margin-right:12px}
          }
          .summary-block{background:#eff6ff;padding:12px;border-radius:10px;margin-bottom:12px;display:flex;flex-direction:column}
          .green-block{background:#ecfdf5;padding:12px;border-radius:10px;margin-bottom:12px;display:flex;flex-direction:column}
          .struct-item{display:flex;justify-content:space-between;align-items:center;padding:10px;background:white;border-radius:8px;border:1px solid #eef2f6}
          .controls{display:flex;gap:12px;justify-content:center}
                    .modern-orange-btn {
            background: linear-gradient(135deg, #1f4f91, #4a78bd);
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 10px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s;
            box-shadow: 0 4px 12px rgba(31, 79, 145, 0.28);
          }

          .modern-orange-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(31, 79, 145, 0.4);
            opacity: 0.95;
          }

          .modern-orange-btn:active {
            transform: translateY(0);
            box-shadow: 0 3px 8px rgba(31, 79, 145, 0.32);
            opacity: 0.9;
          }
        `}</style>

        <main className={containerClass} style={{ paddingTop: '92px' }}>
          <div className={contentClass}>
            <h1 style={{ fontSize: 22 }}>レッスンの設定を確認してください</h1>

            <div className="summary-grid">
              <div className="summary-block">
              <div style={{ marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontWeight: 800 }}>英語レベル:</h3>
                <p style={{ margin: "6px 0 0", fontSize: 18 }}>{level}</p>
              </div>

              <div style={{ marginTop: 10 }}>
                <h3 style={{ margin: 0, fontWeight: 800 }}>トピック:</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {topicsToPass.map((topic) => (
                    <div key={topic} style={{ background: "#d6e4f7", padding: "6px 10px", borderRadius: 999 }}>{topic}</div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <h3 style={{ margin: 0, fontWeight: 800 }}>試験:</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {testsDisplay.map((test) => (
                    <div key={test} style={{ background: "#d6e4f7", padding: "6px 10px", borderRadius: 999 }}>{test}</div>
                  ))}
                </div>
                
              </div>

              <div style={{ marginTop: 10 }}>
                <h3 style={{ margin: 0, fontWeight: 800 }}>スキル:</h3>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  {selectedSkills.map((skill) => (
                    <div key={skill} style={{ background: "#d6e4f7", padding: "6px 10px", borderRadius: 999 }}>{skill}</div>
                  ))}
                </div>
              </div>
              </div>

              <div className="green-block">
              <h2 style={{ margin: "0 0 8px 0" }}>レッスン時間と構成</h2>
              <div style={{ marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontWeight: 800 }}>希望時間:</h3>
                <p style={{ margin: "6px 0 0", fontSize: 18 }}>{selectedDuration}分</p>
              </div>

              <div>
                <h3 style={{ margin: 0, fontWeight: 800 }}>内容構成:</h3>
                <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                  {structure.map((item, idx) => (
                    <div key={idx} className="struct-item">
                      <span style={{ fontWeight: 700 }}>{item.name}</span>
                      <span style={{ background: "#bbf7d0", padding: "6px 10px", borderRadius: 999, fontWeight: 700 }}>{item.minutes}分</span>
                    </div>
                  ))}
                </div>
              </div>
              </div>
            </div>

            {vocabDisplay && (
              <div style={{ background: "#e8f0fb", padding: 12, borderRadius: 10, marginBottom: 12 }}>
                <p style={{ margin: 0 }}><strong>単語練習:</strong> {vocabDisplay}</p>
              </div>
            )}

            <div className="controls">
              <button onClick={() => {
                if (selectedComponents.includes(VOCAB_COMPONENT)) {
                  setStep("vocab-category");
                } else {
                  setStep("components");
                }
              }} className="btn-accent">← 編集</button>

              <button onClick={() => {
                const firstComp = selectedComponents && selectedComponents.length > 0 ? selectedComponents[0] : null;
                if (firstComp) {
                  // If test practice conditions are met, jump to specific test page
                  const testPath = getTestPath();
                  if (testPath) {
                    navigate(testPath);
                  } else {
                    setChatLog([]);
                    setLessonStartTime(Date.now());
                    setTimeElapsed(0);
                    setCurrentComponent(0);
                    setStep("chatting");
                    setTimeout(() => {
                      (async () => {
                        const prompt = await getComponentPrompt(firstComp);
                        handleLessonStart(prompt);
                      })();
                    }, 50);
                  }
                }
              }} className="modern-orange-btn"  style={{ padding: "14px 22px", borderRadius: 14 }}>レッスンを開始する</button>
            </div>
          </div>
        </main>
      </>
    );
  }

  // Chat interface (both modes)
  if (step === "chatting") {
    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    const structure = generateLessonStructure();
    const componentTiming = generateComponentTiming();
    const totalLessonTime = parseInt(selectedDuration) * 60;

    let currentComponentInfo = null;
    if (mode === "lesson" && currentComponent < componentTiming.length) {
      currentComponentInfo = componentTiming[currentComponent];
    }

    return (
      <>
        <style>{`
          .chat-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;gap:12px}
          /* Keep the chat header and controls pinned to the top of the viewport */
          .chat-top{position:sticky;top:8px;z-index:90;background:transparent;padding:4px 0}
          .chat-header{position:fixed;top:0;left:0;right:0;background:white;border-bottom:1px solid #e5e7eb;padding:16px 20px;z-index:100;box-shadow:0 2px 8px rgba(0,0,0,0.08)}
          .chat-header-content{display:flex;align-items:center;justify-content:space-between;max-width:1200px;margin:0 auto}
          .chat-header-left{display:flex;align-items:center;gap:12px}
          .chat-header-logo{width:40px;height:40px;border-radius:8px;object-fit:cover;cursor:pointer;transition:transform 0.2s ease}
          .chat-header-logo:hover{transform:scale(1.05)}
          .chat-header-title{margin:0;font-size:18px;font-weight:700;color:#1f4f91}
          .chat-header-warning{font-size:12px;color:#9ca3af;margin:4px 0 0}
          .chat-header-right{display:flex;align-items:center;gap:12px;font-size:14px;color:#374151}
          @media(max-width:768px){.chat-header{padding:12px 16px}.chat-header-logo{width:32px;height:32px}.chat-header-left{flex-direction:column;align-items:flex-start;gap:8px}}
          .chat-meta{background:#e8f0fb;padding:10px;border-radius:8px;text-align:right}
          .current-session{background:linear-gradient(90deg,#edf4ff,#dfe9f8);padding:10px;border-radius:10px;margin-bottom:12px;border-left:4px solid #4a78bd}
          /* Make the content area a column flex container so chat-window can grow and input stays at bottom */
          .chat-layout{display:flex;flex-direction:column;height:calc(100vh - 24px);min-height:400px;padding-bottom:8px; margin-top: 0;padding-top: 0;}
          .chat-window{background:#f6f9fd;border-radius:10px;padding:12px;flex:1;min-height:0;overflow:auto;margin-bottom:8px;border:1px solid #d9e4f2}
          .msg-user{background:#d6e4f7;padding:10px;border-radius:10px;margin-left:36px;text-align:right}
          .msg-llm{background:#e9eef5;padding:10px;border-radius:10px;margin-right:36px;text-align:left}
          .msg-question{background:#ffffff;padding:18px 20px;border-radius:14px;margin-right:18px;text-align:left;border:2px solid #7da2d7;box-shadow:0 12px 28px rgba(31,79,145,0.14)}
          .msg-question-label{font-size:13px;font-weight:800;color:#1f4f91;margin-bottom:8px}
          .msg-question-text{white-space:pre-wrap;font-size:22px;line-height:1.45;font-weight:800;color:#10213c}
          @media(max-width:640px){.msg-question-text{font-size:19px}.msg-question{margin-right:0;padding:16px}}
          .msg-timer{background:#eef4ff;padding:10px;border-left:4px solid #4a78bd;border-radius:8px;margin-right:36px;font-weight:700}
          .chat-controls{display:flex;gap:8px}
          .input-text{flex:1;padding:10px;border-radius:10px;border:1px solid #e6e9ef}
          .chat-input-row{display:flex;gap:8px;margin-top:6px}
          /* Fix the input row to the bottom of the viewport so it stays visible while messages scroll */
          .chat-input-row.fixed-bottom{
            position:fixed;
            left:50%;
            transform:translateX(-50%);
            bottom:12px;
            width:calc(100% - 48px);
            max-width:900px;
            z-index:110;
            background:transparent;
            padding:6px 0;
            box-sizing:border-box;
          }
          @media (max-width:640px){
            .chat-input-row.fixed-bottom{width:calc(100% - 24px);bottom:10px}
          }
          .chat-actions{display:flex;gap:8px;justify-content:center;margin-top:10px}
          /* Removed: eiken-panel and eiken-controls CSS */
        `}</style>

        <main className={containerClass} style={{ paddingTop: "80px" }}>
          {/* Fixed header outside the card */}
          <div className="chat-header">
            <div className="chat-header-content">
              <div className="chat-header-left">
                <img
                  className="chat-header-logo"
                  src="/images/speakwise.png"
                  alt="SpeakWise"
                  onClick={() => {
                    setMode("choice");
                    setStep("initial");
                    setChatLog([]);
                    setOpeningQuestion("");
                    setLessonStartTime(null);
                    setTimeElapsed(0);
                    setCurrentComponent(0);
                    setDisplayedText({});
                  }}
                  title="クリックして最初に戻る"
                />
                <div>
                  <h1 className="chat-header-title">
                    {mode === "casual" ? "AIとの会話" : "AIによるレッスン"}
                  </h1>
                  <p className="chat-header-warning">
                    ⚠️ 本機能は現在まだ開発実験段階であり、機能が不安定な場合があります。会話の内容は保存されず、プライバシーは保護されます。
                  </p>
                </div>
              </div>
              <div className="chat-header-right">
                <span>
                  <strong>レベル:</strong> {level}
                </span>
                {mode === "lesson" && lessonStartTime && (
                  <>
                    <span style={{ fontSize: 13, color: "#6b7280" }}>
                      経過: {formatTime(timeElapsed)}
                    </span>
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>
                      合計: {selectedDuration}分
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className={contentClass}>
            {/* 現在のセッション情報（横並び3列） */}
            {mode === "lesson" && selectedComponents.length > 0 && currentComponentInfo && (
              <div
                className="current-session"
                style={{
                  marginTop: 0,
                  marginBottom: 12,
                  position: "sticky",
                  top: 92,               
                  zIndex: 50,
                  background: "#edf4ff",
                  padding: "12px 20px",  
                  borderRadius: 12,      
                  marginLeft: "auto",    
                  marginRight: "auto",  
                  boxShadow: "0 2px 6px rgba(0,0,0,0.08)" 
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 12,
                    alignItems: "center"
                  }}
                >
                  <div>
                    <p style={{ margin: 0, fontSize: 13, color: "#374151" }}>
                      <strong>現在のセッション：</strong>
                      <span style={{ marginLeft: 6, color: "#6b7280" }}>
                        {selectedComponents[currentComponent]}
                      </span>
                    </p>
                  </div>

                  <div style={{ textAlign: "center" }}>
                    <p style={{ margin: 0, fontSize: 13, color: "#374151" }}>
                      <strong>このセッション時間：</strong>
                      <span style={{ marginLeft: 6, color: "#6b7280" }}>
                        {Math.ceil((currentComponentInfo.durationSeconds || 0) / 60)}分
                      </span>
                    </p>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <p style={{ margin: 0, fontSize: 13, color: "#374151" }}>
                      <strong>進歩：</strong>
                      <span style={{ marginLeft: 6, color: "#6b7280" }}>
                        {currentComponent + 1}/{selectedComponents.length}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Removed: Eiken panel */}

            <div className="chat-window" role="log" aria-live="polite">
              {chatLog.length === 0 ? (
                <div style={{ textAlign: "center", color: "#9ca3af", paddingTop: 40 }}>
                  <p style={{ marginBottom: 8 }}>{mode === "casual" ? "AIから会話を開始するために考えています、初めに少々お待ちください" : "レッスンを開始するために考えています、初めに少々お待ちください"}</p>
                  <p style={{ fontSize: 12, color: "#c7d2fe" }}>⏳ AI が応答を準備しています...</p>
                </div>
              ) : (
                <>
                  {chatLog.map((entry, index) => (
                    <div key={index} style={{ marginBottom: 10 }}>
                      {entry.sender === "user" ? (
                        <div className="msg-user">{entry.text}</div>
                      ) : entry.text.startsWith("⏱️") ? (
                        <div className="msg-timer">{entry.text}</div>
                      ) : entry.kind === "question" ? (
                        <div className="msg-question">
                          <div className="msg-question-label">練習問題</div>
                          <div className="msg-question-text">{displayedText[index] || entry.text}</div>
                        </div>
                      ) : (
                        <div className="msg-llm">
                          <div style={{ whiteSpace: "pre-wrap" }}>{displayedText[index] !== undefined ? displayedText[index] : entry.text}</div>
                          {!entry.text.includes("Let's practice") && !entry.text.includes("練習をしましょう") && !entry.text.includes("Hello!") && !entry.text.includes("Would you like") && (
                            <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                              <button onClick={() => fetchAndPlayVoice(entry.text, index)} style={{ background: "#2563eb", color: "white", border: "none", padding: "6px 10px", borderRadius: 8, cursor: "pointer" }}>
                                {loadingVoiceIndex === index ? "読み込み中..." : "🔊 再生"}
                              </button>
                              <div style={{ fontSize: 12, color: "#6b7280" }}>声を選択:</div>
                              <select value={selectedVoice} onChange={(e) => setSelectedVoice(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6 }}>
                                <option value="alloy">音声１</option>
                                <option value="verse">音声２</option>
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {/* Show choice buttons when awaiting question choice */}
                  {awaitingQuestionChoice && (
                    <div style={{ marginTop: 16, display: "flex", gap: 12, justifyContent: "center" }}>
                      <button
                        onClick={() => {
                          setAwaitingQuestionChoice(false);
                          // Start lesson with the current question
                          handleLessonStart(openingQuestion);
                        }}
                        style={{
                          padding: "12px 20px",
                          borderRadius: "10px",
                          background: "linear-gradient(135deg, #1f4f91, #4a78bd)",
                          color: "white",
                          border: "none",
                          fontWeight: "bold",
                          fontSize: "15px",
                          cursor: "pointer",
                          boxShadow: "0 4px 10px rgba(0,0,0,0.15)",
                          transition: "transform 0.15s ease, box-shadow 0.15s ease",
                        }}
                        onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
                        onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                      >
                        この練習問題を使う
                      </button>
                      <button
                        onClick={() => {
                          setAwaitingQuestionChoice(false);
                          // Generate a new question
                          handleGenerateNewQuestion();
                        }}
                        style={{
                          padding: "12px 20px",
                          borderRadius: "10px",
                          background: "white",
                          color: "#1f4f91",
                          border: "2px solid #1f4f91",
                          fontWeight: "bold",
                          fontSize: "15px",
                          cursor: "pointer",
                          transition: "transform 0.15s ease, box-shadow 0.15s ease",
                        }}
                        onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.96)")}
                        onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
                      >
                        別の問題を生成する
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>




          </div>
        </main>
      </>
    );
  }

  return null;
}
