export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Liveness only: no user data, database writes, or billable provider calls.
export function GET() {
  return Response.json({ status: "ok", service: "projectfluence" }, { headers: { "Cache-Control": "no-store" } });
}
