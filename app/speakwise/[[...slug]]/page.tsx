import type { Metadata } from "next";
import SpeakWiseApp from "@/apps/speakwise/src/SpeakWiseApp";

export const metadata: Metadata = { title: "会話を練習 · SpeakWiseAI | Project Fluence" };
type Props = { params: Promise<{ slug?: string[] }> };

export default async function Page({ params }: Props) {
  const { slug } = await params;
  return <SpeakWiseApp pathname={slug?.length ? `/${slug.join("/")}` : "/"} />;
}
