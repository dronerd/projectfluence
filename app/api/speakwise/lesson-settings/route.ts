import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/app/api/_lib/supabaseAuth";
import { apiError, ApiError, isPlainObject, readJsonBody } from "@/app/api/_lib/http";
import { supabaseRest } from "@/app/api/_lib/supabaseRest";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ settings: null });
    const params = new URLSearchParams({ select: "settings,updated_at", user_id: `eq.${user.id}`, limit: "1" });
    const rows = await supabaseRest<Array<{ settings: unknown; updated_at: string }>>(`speakwise_lesson_settings?${params}`);
    return NextResponse.json({ settings: isPlainObject(rows[0]?.settings) ? { ...rows[0].settings, targetLanguage: "en" } : null, updatedAt: rows[0]?.updated_at ?? null });
  } catch (error) {
    return apiError(error, "speakwise.settings.read");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) throw new ApiError(401, "Login is required to save SpeakWise settings.", "LOGIN_REQUIRED");
    const body = await readJsonBody(request, 40_000);
    if (!isPlainObject(body) || !isPlainObject(body.settings)) throw new ApiError(400, "settings must be a JSON object.", "INVALID_SETTINGS");
    await supabaseRest("speakwise_lesson_settings?on_conflict=user_id", {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: user.id, settings: { ...body.settings, targetLanguage: "en" } }),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "speakwise.settings.write");
  }
}
