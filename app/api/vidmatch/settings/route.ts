import { supabaseServiceHeaders } from "@/app/api/_lib/supabaseAuth";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getRequiredEnv } from "@/app/api/_lib/supabaseAuth";

import { ApiError, apiError, fetchWithTimeout as fetch, readJsonBody } from "@/app/api/_lib/http";
import { LEVELS, SKILLS, ACCENTS } from "@/apps/vidmatch/src/services/videoContract";

export const runtime = "nodejs";

type SettingsBody = {
  settings?: unknown;
};

type SettingsRow = {
  settings: unknown;
  updated_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) throw new ApiError(401, "Login is required to read settings.", "unauthorized");

    const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const params = new URLSearchParams({
      select: "settings,updated_at",
      user_id: `eq.${authUser.id}`,
      limit: "1",
    });

    const response = await fetch(`${supabaseUrl}/rest/v1/vidmatch_user_settings?${params}`, {
      headers: {
        ...supabaseServiceHeaders(serviceRoleKey),
      },
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(error?.message ?? `Supabase settings read failed with status ${response.status}`);
    }

    const rows = (await response.json()) as SettingsRow[];
    return NextResponse.json({
      settings: rows[0]?.settings ?? null,
      updatedAt: rows[0]?.updated_at ?? null,
    });
  } catch (error) {
    return apiError(error, "vidmatch.settings.read");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await readJsonBody(request, 4096) as SettingsBody | null;
    if (!body || !isPlainObject(body.settings)) throw new ApiError(400, "settings must be a JSON object.", "invalid_request");
    const settings = validateSettings(body.settings);
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Login is required to save VidMatch settings." }, { status: 401 });
    }

    const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const response = await fetch(`${supabaseUrl}/rest/v1/vidmatch_user_settings?on_conflict=user_id`, {
      method: "POST",
      headers: {
        ...supabaseServiceHeaders(serviceRoleKey),
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        user_id: authUser.id,
        settings,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(error?.message ?? `Supabase settings upsert failed with status ${response.status}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, "vidmatch.settings.save");
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateSettings(settings: Record<string, unknown>) {
  const allowedArray = (value: unknown, choices: readonly string[], max: number) => Array.isArray(value) && value.length <= max && value.every((entry) => typeof entry === "string" && choices.includes(entry));
  if (typeof settings.selectedLevel !== "string" || !LEVELS.includes(settings.selectedLevel as typeof LEVELS[number]) ||
    !allowedArray(settings.selectedSkills, SKILLS, 5) || !allowedArray(settings.selectedTopics, ["travel", "daily life", "school"], 3) ||
    typeof settings.customTopics !== "string" || settings.customTopics.length > 240 ||
    typeof settings.selectedAccent !== "string" || (settings.selectedAccent !== "" && !ACCENTS.includes(settings.selectedAccent as typeof ACCENTS[number])) ||
    typeof settings.captionOnly !== "boolean") throw new ApiError(400, "Invalid video search settings.", "invalid_request");
  const topics = settings.customTopics.split(/[,、]/).map((topic) => topic.trim()).filter(Boolean);
  if (topics.length + (settings.selectedTopics as string[]).length > 10 || topics.some((topic) => topic.length > 80)) throw new ApiError(400, "Too many topics, or a topic is too long.", "invalid_request");
  return { selectedLevel: settings.selectedLevel, selectedSkills: settings.selectedSkills, selectedTopics: settings.selectedTopics, customTopics: settings.customTopics, selectedAccent: settings.selectedAccent, captionOnly: settings.captionOnly };
}
