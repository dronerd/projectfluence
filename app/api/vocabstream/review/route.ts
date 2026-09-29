import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/app/api/_lib/supabaseAuth";
import { getVocabStreamReview } from "@/apps/vocabstream/src/services/reviewService";

import { apiError } from "@/app/api/_lib/http";

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
    return apiError(error, "vocabstream.review");
  }
}
