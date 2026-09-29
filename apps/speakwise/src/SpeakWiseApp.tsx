"use client";

import AIChat from "./pages/AI_chat";
import { Navigate } from "./lib/router-compat";
import AppHeader from "@/app/components/AppHeader";
import "./SpeakWise.css";

type Props = { pathname: string };

export default function SpeakWiseApp({ pathname }: Props) {
  if (pathname !== "/") return <Navigate to="/" />;

  return (
    <div className="speakwise-app">
      <AppHeader />
      <AIChat />
    </div>
  );
}
