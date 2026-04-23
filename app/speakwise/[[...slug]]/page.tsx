"use client";

import { use } from "react";
import SpeakWiseApp from "@/apps/speakwise/src/SpeakWiseApp";

type Props = {
  params: Promise<{
    slug?: string[];
  }>;
};

export default function SpeakWisePage({ params }: Props) {
  const resolvedParams = use(params);
  const pathname = resolvedParams.slug?.length ? `/${resolvedParams.slug.join("/")}` : "/";
  return <SpeakWiseApp pathname={pathname} />;
}
