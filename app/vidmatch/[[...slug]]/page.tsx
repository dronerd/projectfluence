import type { Metadata } from "next";
import VidMatchApp from "@/apps/vidmatch/src/VidMatchApp";

export const metadata: Metadata = { title: "動画で学ぶ · VidMatch | Project Fluence" };
type Props = { params: Promise<{ slug?: string[] }> };

export default async function Page({ params }: Props) {
  const { slug } = await params;
  return <VidMatchApp pathname={slug?.length ? `/${slug.join("/")}` : "/"} />;
}
