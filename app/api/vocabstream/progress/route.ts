import { NextRequest, NextResponse } from "next/server";
import { saveVocabStreamProgress } from "@/apps/vocabstream/src/services/progressService";
import { parseVocabStreamProgress, ProgressValidationError } from "@/apps/vocabstream/src/lib/progressContract";
import { getAuthenticatedUser } from "@/app/api/_lib/supabaseAuth";
import { ApiError, apiError, readJsonBody } from "@/app/api/_lib/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) throw new ApiError(401, "Sign in to save your learning progress.", "AUTH_REQUIRED");
    const input = parseVocabStreamProgress(await readJsonBody(request, 512_000));
    const result = await saveVocabStreamProgress(authUser.id, input);
    return NextResponse.json({ ok: true, lessonAttemptId: result.lessonAttempt.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error instanceof ProgressValidationError ? new ApiError(400, error.message, "INVALID_PROGRESS") : error, "vocabstream.progress");
  }
}
