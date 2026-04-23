"use client";

import { use } from "react";
import VocabStreamApp from "@/apps/vocabstream/src/VocabStreamApp";

type Props = {
  params: Promise<{
    slug?: string[];
  }>;
};

export default function VocabStreamPage({ params }: Props) {
  const resolvedParams = use(params);
  const pathname = resolvedParams.slug?.length ? `/${resolvedParams.slug.join("/")}` : "/";
  return <VocabStreamApp pathname={pathname} />;
}
