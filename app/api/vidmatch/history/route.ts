import { supabaseServiceHeaders } from "@/app/api/_lib/supabaseAuth";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getRequiredEnv } from "@/app/api/_lib/supabaseAuth";
import { ApiError, apiError, fetchWithTimeout, readJsonBody } from "@/app/api/_lib/http";
import { isYoutubeVideoId } from "@/apps/vidmatch/src/services/videoContract";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) throw new ApiError(401, "Login is required to read video history.", "unauthorized");
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 100);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ApiError(400, "limit must be an integer from 1 to 100.", "invalid_request");
    const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const params = new URLSearchParams({
      select: "video_id,title,channel_name,youtube_url,thumbnail_url,duration,level,skills,topics,accent,quality_score,click_count,last_clicked_at,created_at",
      user_id: `eq.${authUser.id}`, order: "last_clicked_at.desc", limit: String(limit),
    });
    const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1/vidmatch_video_view_history?${params}`, {
      headers: { ...supabaseServiceHeaders(serviceRoleKey) },
    });
    if (!response.ok) throw new ApiError(503, "Video history is temporarily unavailable.", "database_unavailable");
    return NextResponse.json({ history: await response.json() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error, "vidmatch.history.read"); }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) throw new ApiError(401, "Login is required to save video history.", "unauthorized");
    const body = await readJsonBody(request, 16_384);
    if (!body || typeof body !== "object" || !("video_id" in body) || !isYoutubeVideoId(body.video_id)) {
      throw new ApiError(400, "A valid video_id is required.", "invalid_request");
    }
    const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    // The database reads catalog metadata and increments the view count atomically.
    // Client-provided titles, URLs, user IDs, and counts are deliberately ignored.
    const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1/rpc/record_vidmatch_video_view`, {
      method: "POST",
      headers: { ...supabaseServiceHeaders(serviceRoleKey), "Content-Type": "application/json" },
      body: JSON.stringify({ p_user_id: authUser.id, p_video_id: body.video_id }),
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => null) as { code?: string } | null;
      if (failure?.code === "22023") throw new ApiError(404, "This video is no longer in the catalog.", "video_not_found");
      throw new ApiError(503, "Video history could not be saved.", "database_unavailable");
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error, "vidmatch.history.save"); }
}
