import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/app/api/_lib/supabaseAuth";
import { apiError, ApiError } from "@/app/api/_lib/http";
import { supabaseRest } from "@/app/api/_lib/supabaseRest";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) throw new ApiError(401, "Login is required to view analytics.", "LOGIN_REQUIRED");
    // PostgreSQL aggregation avoids truncating lifetime totals at REST's default row limit.
    const summary = await supabaseRest<Record<string, unknown>>("rpc/get_learning_analytics", {
      method: "POST", body: JSON.stringify({ p_user_id: user.id }),
    });
    if (!summary?.vocabstream || !summary?.vidmatch || !summary?.speakwise) throw new Error("Invalid analytics response");
    return NextResponse.json(summary, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error, "analytics.summary");
  }
}
