import type { Metadata } from "next";
import VocabStreamApp from "@/apps/vocabstream/src/VocabStreamApp";

export const metadata: Metadata = { title: "単語を学ぶ · VocabStream | Project Fluence" };
type Props = { params: Promise<{ slug?: string[] }> };

export default async function Page({ params }: Props) {
  const { slug } = await params;
  return <VocabStreamApp pathname={slug?.length ? `/${slug.join("/")}` : "/"} />;
}
