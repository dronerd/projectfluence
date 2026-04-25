"use client";

import React, { useEffect } from "react";
import { AuthProvider } from "./AuthContext";
import Header from "./components/Header";
import LearnGenres from "./pages/LearnGenres";
import LessonList from "./pages/LessonList";
import Lesson from "./pages/Lesson";
import Review from "./pages/Review";
import Privacy from "./pages/Privacy";
import Prompts from "./pages/ChatGPT_prompts";
import StillUnderDevelopment from "./pages/Still_under_development";
import ReviewLessonDecide from "./pages/ReviewLessonDecide";
import ReviewLesson from "./pages/ReviewLesson";
import Eiken1Speaking from "./pages/eiken/eiken1_speaking";
import Pre1Listening from "./pages/eiken/pre1_listening";
import Pre1Speaking from "./pages/eiken/pre1_speaking";
import Pre1Reading from "./pages/eiken/pre1_reading";
import Pre1Writing from "./pages/eiken/pre1_writing";
import Pre2Listening from "./pages/eiken/pre2_listening";
import Pre2Speaking from "./pages/eiken/pre2_speaking";
import Pre2Reading from "./pages/eiken/pre2_reading";
import Pre2Writing from "./pages/eiken/pre2_writing";
import ThreeListening from "./pages/eiken/3_listening";
import ThreeSpeaking from "./pages/eiken/3_speaking";
import ThreeReading from "./pages/eiken/3_reading";
import ThreeWriting from "./pages/eiken/3_writing";
import ToeicListening from "./pages/toeic/listening";
import ToeicSpeaking from "./pages/toeic/speaking";
import ToeicReading from "./pages/toeic/reading";
import ToeicWriting from "./pages/toeic/writing";
import IeltsListening from "./pages/ielts/listening";
import IeltsSpeaking from "./pages/ielts/speaking";
import IeltsReading from "./pages/ielts/reading";
import IeltsWriting from "./pages/ielts/writing";
import ToeflListening from "./pages/toefl/listening";
import ToeflSpeaking from "./pages/toefl/speaking";
import ToeflReading from "./pages/toefl/reading";
import ToeflWriting from "./pages/toefl/writing";
import { RouterCompatProvider } from "./lib/router-compat";
import { matchPath } from "./lib/routes";

type Props = {
  pathname: string;
};

function SpeakWiseRedirect() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.location.assign("/speakwise");
    }
  }, []);

  return null;
}

const routeTable = [
  { pattern: "/", render: () => <LearnGenres />, params: () => ({}) },
  { pattern: "/landing_page", render: () => <LearnGenres />, params: () => ({}) },
  { pattern: "/home", render: () => <LearnGenres />, params: () => ({}) },
  { pattern: "/learn", render: () => <LearnGenres />, params: () => ({}) },
  {
    pattern: "/learn/:genreId",
    render: () => <LessonList />,
    params: (params: Record<string, string>) => params,
  },
  {
    pattern: "/lesson/:lessonId",
    render: () => <Lesson />,
    params: (params: Record<string, string>) => params,
  },
  { pattern: "/review", render: () => <Review />, params: () => ({}) },
  {
    pattern: "/review/:id",
    render: (params: Record<string, string>) =>
      params.id.includes("-lesson-") ? <ReviewLesson /> : <ReviewLessonDecide />,
    params: (params: Record<string, string>) =>
      params.id.includes("-lesson-")
        ? { lessonId: params.id }
        : { genreId: params.id },
  },
  { pattern: "/others", render: () => <LearnGenres />, params: () => ({}) },
  { pattern: "/privacy", render: () => <Privacy />, params: () => ({}) },
  { pattern: "/prompts", render: () => <Prompts />, params: () => ({}) },
  {
    pattern: "/still_under_development",
    render: () => <StillUnderDevelopment />,
    params: () => ({}),
  },
  { pattern: "/ai_chat", render: () => <SpeakWiseRedirect />, params: () => ({}) },
  { pattern: "/eiken1_speaking", render: () => <Eiken1Speaking />, params: () => ({}) },
  { pattern: "/pre1_listening", render: () => <Pre1Listening />, params: () => ({}) },
  { pattern: "/pre1_speaking", render: () => <Pre1Speaking />, params: () => ({}) },
  { pattern: "/pre1_reading", render: () => <Pre1Reading />, params: () => ({}) },
  { pattern: "/pre1_writing", render: () => <Pre1Writing />, params: () => ({}) },
  { pattern: "/pre2_listening", render: () => <Pre2Listening />, params: () => ({}) },
  { pattern: "/pre2_speaking", render: () => <Pre2Speaking />, params: () => ({}) },
  { pattern: "/pre2_reading", render: () => <Pre2Reading />, params: () => ({}) },
  { pattern: "/pre2_writing", render: () => <Pre2Writing />, params: () => ({}) },
  { pattern: "/3_listening", render: () => <ThreeListening />, params: () => ({}) },
  { pattern: "/3_speaking", render: () => <ThreeSpeaking />, params: () => ({}) },
  { pattern: "/3_reading", render: () => <ThreeReading />, params: () => ({}) },
  { pattern: "/3_writing", render: () => <ThreeWriting />, params: () => ({}) },
  { pattern: "/toeic_listening", render: () => <ToeicListening />, params: () => ({}) },
  { pattern: "/toeic_speaking", render: () => <ToeicSpeaking />, params: () => ({}) },
  { pattern: "/toeic_reading", render: () => <ToeicReading />, params: () => ({}) },
  { pattern: "/toeic_writing", render: () => <ToeicWriting />, params: () => ({}) },
  { pattern: "/ielts_listening", render: () => <IeltsListening />, params: () => ({}) },
  { pattern: "/ielts_speaking", render: () => <IeltsSpeaking />, params: () => ({}) },
  { pattern: "/ielts_reading", render: () => <IeltsReading />, params: () => ({}) },
  { pattern: "/ielts_writing", render: () => <IeltsWriting />, params: () => ({}) },
  { pattern: "/toefl_listening", render: () => <ToeflListening />, params: () => ({}) },
  { pattern: "/toefl_speaking", render: () => <ToeflSpeaking />, params: () => ({}) },
  { pattern: "/toefl_reading", render: () => <ToeflReading />, params: () => ({}) },
  { pattern: "/toefl_writing", render: () => <ToeflWriting />, params: () => ({}) },
];

function resolveRoute(pathname: string) {
  for (const route of routeTable) {
    const matched = matchPath(route.pattern, pathname);
    if (matched) {
      const params = route.params(matched.params);
      return {
        params,
        element: route.render(matched.params),
      };
    }
  }

  return {
    params: {},
    element: <LearnGenres />,
  };
}

export default function VocabStreamApp({ pathname }: Props) {
  const { params, element } = resolveRoute(pathname);

  return (
    <RouterCompatProvider pathname={pathname} params={params}>
      <AuthProvider>
        <style>{`
          :root {
            --vs-bg: #081225;
            --vs-bg-soft: #13233f;
            --vs-panel: rgba(247, 250, 252, 0.96);
            --vs-panel-strong: #ffffff;
            --vs-border: rgba(125, 151, 191, 0.22);
            --vs-text: #dbe7f5;
            --vs-text-dark: #0f1d35;
            --vs-muted: #6c7c93;
            --vs-primary: #5e9df6;
            --vs-primary-strong: #2f6fda;
            --vs-shadow: 0 20px 55px rgba(4, 10, 24, 0.34);
          }

          html, body, #__next {
            background: #e5e7eb;
            color: var(--vs-text);
          }

          body {
            margin: 0;
            min-height: 100vh;
            font-family: Inter, Arial, sans-serif;
          }

          .vocabstream-shell {
            min-height: 100vh;
            background: #e5e7eb;
            color: var(--vs-text);
          }

          .vocabstream-content {
            padding: 96px 16px 104px;
            min-height: 100vh;
          }

          .vocabstream-shell a {
            color: inherit;
          }

          .vocabstream-shell main.p-6.max-w-3xl.mx-auto {
            max-width: 860px;
            margin: 0 auto;
            padding: 104px 20px 120px !important;
          }

          .vocabstream-shell main.p-6.max-w-3xl.mx-auto > section,
          .vocabstream-shell main.p-6.max-w-3xl.mx-auto > div.mt-8 {
            background: linear-gradient(180deg, rgba(250, 252, 255, 0.98), rgba(237, 243, 250, 0.96));
            color: var(--vs-text-dark);
            border: 1px solid var(--vs-border);
            border-radius: 24px;
            box-shadow: var(--vs-shadow);
            padding: 24px;
          }

          .vocabstream-shell .vocab-placeholder-card {
            background: linear-gradient(180deg, rgba(250, 252, 255, 0.98), rgba(237, 243, 250, 0.96));
            color: var(--vs-text-dark);
            border: 1px solid var(--vs-border);
            border-radius: 24px;
            box-shadow: var(--vs-shadow);
            padding: 24px;
          }
        `}</style>
        <Header currentPath={pathname} isLoginPage={false} />
        <div className="vocabstream-shell">
          <div className="vocabstream-content">{element}</div>
        </div>
      </AuthProvider>
    </RouterCompatProvider>
  );
}
