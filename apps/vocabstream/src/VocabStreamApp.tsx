"use client";

import React, { useEffect } from "react";
import { AuthProvider } from "./AuthContext";
import Header from "./components/Header";
import LearnGenres from "./pages/LearnGenres";
import LessonList from "./pages/LessonList";
import Lesson from "./pages/Lesson";
import StillUnderDevelopment from "./pages/Still_under_development";
import ReviewLessonDecide from "./pages/ReviewLessonDecide";
import ReviewLesson from "./pages/ReviewLesson";
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
  {
    pattern: "/still_under_development",
    render: () => <StillUnderDevelopment />,
    params: () => ({}),
  },
  { pattern: "/ai_chat", render: () => <SpeakWiseRedirect />, params: () => ({}) },
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
