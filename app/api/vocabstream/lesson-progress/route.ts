import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getRequiredEnv } from "@/app/api/_lib/supabaseAuth";

export const runtime = "nodejs";

type ProgressRow = {
  lesson_id: string;
  percent_score: number;
  total_possible: number;
  updated_at: string;
};

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return NextResponse.json({ progress: [] });
    }

    const genre = request.nextUrl.searchParams.get("genre")?.trim();
    if (!genre) {
      return NextResponse.json({ error: "genre is required." }, { status: 400 });
    }

    const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const params = new URLSearchParams({
      select: "lesson_id,percent_score,total_possible,updated_at",
      user_id: `eq.${authUser.id}`,
      genre: `eq.${genre}`,
      order: "updated_at.desc",
    });

    const response = await fetch(`${supabaseUrl}/rest/v1/vocabstream_user_lesson_progress?${params}`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(error?.message ?? `Supabase progress read failed with status ${response.status}`);
    }

    const rows = (await response.json()) as ProgressRow[];
    return NextResponse.json({
      progress: rows.map((row) => ({
        lessonId: row.lesson_id,
        percentScore: Number(row.percent_score),
        totalPossible: Number(row.total_possible),
        updatedAt: row.updated_at,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Progress lookup failed";
    const status = message === "Invalid Supabase session." ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
