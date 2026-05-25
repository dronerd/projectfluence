import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/app/api/_lib/supabaseAuth";
import { getVocabStreamReview } from "@/apps/vocabstream/src/services/reviewService";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const review = await getVocabStreamReview(authUser.id);
    return NextResponse.json(review);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review lookup failed";
    const status = message === "Invalid Supabase session." ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
