"use client";

import React, { useEffect } from "react";
import "./vocabstream.css";
import { AuthProvider } from "./AuthContext";
import Header from "./components/Header";
import LearnGenres from "./pages/LearnGenres";
import LessonList from "./pages/LessonList";
import Lesson from "./pages/Lesson";
import ReviewLesson from "./pages/ReviewLesson";
import WeakWords from "./pages/WeakWords";
import StillUnderDevelopment from "./pages/Still_under_development";
import { RouterCompatProvider } from "./lib/router-compat";
import { matchPath } from "./lib/routes";

type Props = {
  pathname: string;
};

type RouteEntry = {
  pattern: string;
  render: (params: Record<string, string>) => React.ReactNode;
  params: (params: Record<string, string>) => Record<string, string>;
};

function SpeakWiseRedirect() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.location.assign("/speakwise");
    }
  }, []);

  return null;
}

const routeTable: RouteEntry[] = [
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
  { pattern: "/review", render: () => <ReviewLesson />, params: () => ({}) },
  { pattern: "/weak-words", render: () => <WeakWords />, params: () => ({}) },
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
        <Header currentPath={pathname} isLoginPage={false} />
        <div className="vocabstream-shell">
          <main id="main-content" className="vocabstream-content">{element}</main>
        </div>
      </AuthProvider>
    </RouterCompatProvider>
  );
}
