import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getRequiredEnv } from "@/app/api/_lib/supabaseAuth";

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
    if (!authUser) return NextResponse.json({ settings: null });

    const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const params = new URLSearchParams({
      select: "settings,updated_at",
      user_id: `eq.${authUser.id}`,
      limit: "1",
    });

    const response = await fetch(`${supabaseUrl}/rest/v1/vidmatch_user_settings?${params}`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
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
    const message = error instanceof Error ? error.message : "VidMatch settings lookup failed";
    const status = message === "Invalid Supabase session." ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as SettingsBody | null;
  if (!body || !isPlainObject(body.settings)) {
    return NextResponse.json({ error: "settings must be a JSON object." }, { status: 400 });
  }

  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Login is required to save VidMatch settings." }, { status: 401 });
    }

    const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const response = await fetch(`${supabaseUrl}/rest/v1/vidmatch_user_settings?on_conflict=user_id`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        user_id: authUser.id,
        settings: body.settings,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(error?.message ?? `Supabase settings upsert failed with status ${response.status}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "VidMatch settings save failed";
    const status = message === "Invalid Supabase session." ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
