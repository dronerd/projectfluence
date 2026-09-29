import { timingSafeEqual } from "node:crypto";
import { ApiError, fetchWithTimeout } from "./http.ts";

export type SupabaseAuthUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

export async function getAuthenticatedUser(request: Request): Promise<SupabaseAuthUser | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;

  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  if (!match?.[1] || match[1].length > 8192) {
    throw new ApiError(401, "Please sign in again.", "INVALID_SESSION");
  }

  const supabaseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const apiKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${match[1]}`,
    },
  }, 8000);

  if ([400, 401, 403].includes(response.status)) throw new ApiError(401, "Please sign in again.", "INVALID_SESSION");
  if (!response.ok) throw new ApiError(503, "Sign-in is temporarily unavailable. Please try again.", "AUTH_UNAVAILABLE");

  const user: unknown = await response.json();
  if (!user || typeof user !== "object" || !("id" in user) || typeof user.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)) {
    throw new ApiError(503, "Sign-in is temporarily unavailable. Please try again.", "AUTH_UNAVAILABLE");
  }
  return user as SupabaseAuthUser;
}

export function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new ApiError(503, "This service is not configured yet.", "SERVICE_NOT_CONFIGURED");
  }

  return value;
}

export function secureTokenMatches(request: Request, expected: string | undefined) {
  if (!expected) return false;
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${expected}`);
  return received.length === wanted.length && timingSafeEqual(received, wanted);
}

export function supabaseServiceHeaders(key: string): Record<string, string> {
  // Current sb_secret keys are not JWTs. Legacy service_role keys still use Bearer.
  return key.startsWith("sb_secret_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
}
