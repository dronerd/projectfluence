import { ApiError, fetchWithTimeout } from "./http.ts";
import { getRequiredEnv, supabaseServiceHeaders } from "./supabaseAuth.ts";

/** Service-role requests: callers must first verify the user and scope every query. */
export async function supabaseRest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const headers = new Headers(init.headers);
  headers.delete("Authorization");
  for (const [name, value] of Object.entries(supabaseServiceHeaders(key))) headers.set(name, value);
  headers.set("Content-Type", "application/json");
  const response = await fetchWithTimeout(`${getRequiredEnv("SUPABASE_URL").replace(/\/$/, "")}/rest/v1/${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { code?: string } | null;
    if (body?.code === "42501") throw new ApiError(403, "You cannot access this learning record.", "FORBIDDEN");
    if (body?.code === "22023") throw new ApiError(400, "The learning record is invalid.", "INVALID_RECORD");
    throw new ApiError(503, "Learning records are temporarily unavailable. Please try again.", "DATABASE_UNAVAILABLE");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
