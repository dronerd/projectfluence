"use client";

import { use } from "react";
import VidMatchApp from "@/apps/vidmatch/src/VidMatchApp";

type Props = {
  params: Promise<{
    slug?: string[];
  }>;
};

export default function VidMatchPage({ params }: Props) {
  const resolvedParams = use(params);
  const pathname = resolvedParams.slug?.length ? `/${resolvedParams.slug.join("/")}` : "/";
  return <VidMatchApp pathname={pathname} />;
}
