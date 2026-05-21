import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getRequiredEnv } from "@/app/api/_lib/supabaseAuth";

export const runtime = "nodejs";

type HistoryVideoPayload = {
  video_id?: unknown;
  title?: unknown;
  channel_name?: unknown;
  youtube_url?: unknown;
  thumbnail_url?: unknown;
  duration?: unknown;
  level?: unknown;
  skills?: unknown;
  topics?: unknown;
  accent?: unknown;
  quality_score?: unknown;
};

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return NextResponse.json({ history: [] });

    const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const params = new URLSearchParams({
      select:
        "video_id,title,channel_name,youtube_url,thumbnail_url,duration,level,skills,topics,accent,quality_score,click_count,last_clicked_at,created_at",
      user_id: `eq.${authUser.id}`,
      order: "last_clicked_at.desc",
      limit: request.nextUrl.searchParams.get("limit") || "100",
    });

    const response = await fetch(`${supabaseUrl}/rest/v1/vidmatch_video_view_history?${params}`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(error?.message ?? `Supabase history read failed with status ${response.status}`);
    }

    return NextResponse.json({ history: await response.json() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "VidMatch history lookup failed";
    const status = message === "Invalid Supabase session." ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as HistoryVideoPayload | null;
  const parsed = parseVideoPayload(body);
  if (parsed instanceof NextResponse) return parsed;

  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ error: "Login is required to save VidMatch history." }, { status: 401 });
    }

    const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const payload = {
      ...parsed,
      user_id: authUser.id,
      last_clicked_at: new Date().toISOString(),
    };

    const response = await fetch(
      `${supabaseUrl}/rest/v1/vidmatch_video_view_history?on_conflict=user_id,video_id`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(error?.message ?? `Supabase history upsert failed with status ${response.status}`);
    }

    return NextResponse.json({ ok: true, history: await response.json() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "VidMatch history save failed";
    const status = message === "Invalid Supabase session." ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function parseVideoPayload(body: HistoryVideoPayload | null) {
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  if (!isNonEmptyString(body.video_id) || !isNonEmptyString(body.title) || !isNonEmptyString(body.youtube_url)) {
    return NextResponse.json({ error: "video_id, title, and youtube_url are required." }, { status: 400 });
  }

  return {
    video_id: body.video_id.trim(),
    title: body.title.trim(),
    channel_name: isNonEmptyString(body.channel_name) ? body.channel_name.trim() : "Unknown channel",
    youtube_url: body.youtube_url.trim(),
    thumbnail_url: optionalString(body.thumbnail_url),
    duration: optionalString(body.duration),
    level: optionalString(body.level),
    skills: stringArray(body.skills),
    topics: stringArray(body.topics),
    accent: optionalString(body.accent),
    quality_score: optionalNumber(body.quality_score) ?? 0,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalString(value: unknown) {
  return isNonEmptyString(value) ? value.trim() : null;
}

function optionalNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isNonEmptyString).map((item) => item.trim()) : [];
}
