import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/app/api/_lib/supabaseAuth";
import { apiError, ApiError, isPlainObject, readJsonBody } from "@/app/api/_lib/http";
import { supabaseRest } from "@/app/api/_lib/supabaseRest";
import { parseLessonFields } from "../validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) throw new ApiError(401, "Login is required to save SpeakWise session analytics.", "LOGIN_REQUIRED");
    const body = await readJsonBody(request, 12_000);
    if (!isPlainObject(body)) throw new ApiError(400, "Request body must be a JSON object.", "INVALID_SESSION");
    const fields = parseLessonFields(body);
    const sessionId = body.sessionId ?? crypto.randomUUID();
    if (typeof sessionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) throw new ApiError(400, "The lesson session ID is invalid.", "INVALID_SESSION_ID");
    let rows = await supabaseRest<Array<{ id: string }>>("speakwise_lesson_sessions?select=id&on_conflict=id", {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ id: sessionId, user_id: user.id, mode: fields.mode, lesson_mode: fields.lessonMode,
        level: fields.level, planned_duration_minutes: fields.durationMinutes,
        selected_topics: fields.topics, selected_components: [fields.lessonMode] }),
    });
    if (!rows[0]?.id) {
      const params = new URLSearchParams({ select: "id", id: `eq.${sessionId}`, user_id: `eq.${user.id}`, limit: "1" });
      rows = await supabaseRest<Array<{ id: string }>>(`speakwise_lesson_sessions?${params}`);
      if (!rows[0]?.id) throw new ApiError(403, "You cannot access this lesson session.", "FORBIDDEN");
    }
    return NextResponse.json({ ok: true, session: rows[0] });
  } catch (error) {
    return apiError(error, "speakwise.sessions.create");
  }
}
