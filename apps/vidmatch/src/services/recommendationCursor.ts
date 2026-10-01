import { createHash } from "node:crypto";
import { isYoutubeVideoId } from "./videoContract.ts";

export const CANDIDATE_WINDOW = 48;
export type RecommendationCursor = { version: 1; fingerprint: string; after: string | null; pending: string[]; more: boolean };
export function filterFingerprint(filters: unknown): string {
  return createHash("sha256").update(JSON.stringify(filters)).digest("base64url").slice(0, 22);
}
export function encodeCursor(cursor: RecommendationCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}
export function decodeCursor(value: string | undefined, fingerprint: string): RecommendationCursor {
  if (!value) return { version: 1, fingerprint, after: null, pending: [], more: true };
  if (value.length > 3000 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid recommendation cursor");
  let cursor: Partial<RecommendationCursor>;
  try { cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8")); } catch { throw new Error("Invalid recommendation cursor"); }
  if (!cursor || cursor.version !== 1 || cursor.fingerprint !== fingerprint ||
    (cursor.after !== null && !isYoutubeVideoId(cursor.after)) || typeof cursor.more !== "boolean" ||
    !Array.isArray(cursor.pending) || cursor.pending.length > CANDIDATE_WINDOW || !cursor.pending.every(isYoutubeVideoId) || new Set(cursor.pending).size !== cursor.pending.length) {
    throw new Error("Invalid recommendation cursor");
  }
  return cursor as RecommendationCursor;
}
