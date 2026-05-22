import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getRequiredEnv } from "@/app/api/_lib/supabaseAuth";

export const runtime = "nodejs";

type SessionBody = {
  mode?: unknown;
  lessonMode?: unknown;
  level?: unknown;
  plannedDurationMinutes?: unknown;
  selectedTopics?: unknown;
  selectedComponents?: unknown;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as SessionBody | null;
  const parsed = parseSessionBody(body);
  if (parsed instanceof NextResponse) return parsed;

  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Login is required to save SpeakWise session analytics." }, { status: 401 });
    }

    const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const response = await fetch(`${supabaseUrl}/rest/v1/speakwise_lesson_sessions`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        user_id: authUser.id,
        mode: parsed.mode,
        lesson_mode: parsed.lessonMode,
        level: parsed.level,
        planned_duration_minutes: parsed.plannedDurationMinutes,
        selected_topics: parsed.selectedTopics,
        selected_components: parsed.selectedComponents,
      }),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(error?.message ?? `Supabase session insert failed with status ${response.status}`);
    }

    const rows = (await response.json().catch(() => [])) as Array<{ id?: string }>;
    return NextResponse.json({ ok: true, session: rows[0] ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SpeakWise session analytics save failed";
    const status = message === "Invalid Supabase session." ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function parseSessionBody(body: SessionBody | null) {
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const mode = body.mode === "writing" ? "writing" : "speaking";
  const level = readAllowedString(body.level, ["A1", "A2", "B1", "B2", "C1", "C2"]) || "B2";
  const plannedDurationMinutes = Math.max(0, Math.min(240, Math.round(Number(body.plannedDurationMinutes) || 0)));

  return {
    mode,
    lessonMode: typeof body.lessonMode === "string" && body.lessonMode.trim()
      ? body.lessonMode.trim()
      : mode === "writing"
        ? "writing_feedback"
        : "speaking_practice",
    level,
    plannedDurationMinutes,
    selectedTopics: stringArray(body.selectedTopics),
    selectedComponents: stringArray(body.selectedComponents),
  };
}

function readAllowedString(value: unknown, allowedValues: readonly string[]) {
  return typeof value === "string" && allowedValues.includes(value) ? value : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}
