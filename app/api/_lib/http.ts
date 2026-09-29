/** Small server-side boundaries shared by the Next.js API routes. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code = "REQUEST_FAILED") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function fetchWithTimeout(input: string | URL | Request, init: RequestInit = {}, timeoutMs = 15_000) {
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
  try {
    // The deadline remains attached while the response body is consumed.
    return await fetch(input, { cache: "no-store", ...init, signal });
  } catch (error) {
    if (deadline.aborted) throw new ApiError(504, "The service took too long to respond. Please try again.", "UPSTREAM_TIMEOUT");
    throw error;
  }
}

export function apiError(error: unknown, context: string) {
  const timeout = error instanceof Error && error.name === "TimeoutError";
  const known = error instanceof ApiError;
  const status = known ? error.status : timeout ? 504 : 503;
  const code = known ? error.code : timeout ? "UPSTREAM_TIMEOUT" : "SERVICE_UNAVAILABLE";
  const requestId = crypto.randomUUID();
  // Never log provider/database messages, request bodies, URLs, or tokens.
  console.warn(JSON.stringify({ event: "api_failure", context, status, code, requestId }));
  return Response.json({
    error: known ? error.message : "This service is temporarily unavailable. Please try again.",
    code,
    requestId,
  }, { status, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } });
}

export async function readJsonBody(request: Request, maxBytes = 65_536): Promise<unknown> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) {
    throw new ApiError(413, "The request is too large.", "PAYLOAD_TOO_LARGE");
  }
  if (!request.body) throw new ApiError(400, "Request body must contain valid JSON.", "INVALID_JSON");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timedOut = false;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  const deadline = setTimeout(() => { timedOut = true; cancel(); }, 10_000);
  request.signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      if (request.signal.aborted) throw new ApiError(408, "The request was interrupted.", "REQUEST_INTERRUPTED");
      const { done, value } = await reader.read();
      if (timedOut) throw new ApiError(408, "The request took too long to upload.", "REQUEST_TIMEOUT");
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new ApiError(413, "The request is too large.", "PAYLOAD_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(deadline);
    request.signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(400, "Request body must contain valid JSON.", "INVALID_JSON");
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
