import type { ApiErrorCode } from "../shared/api";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
} as const;

const MAX_BODY_BYTES = 16 * 1024;

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(JSON_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(JSON.stringify(body), { ...init, headers });
}

/** Generic client-facing error. Never pass raw exception messages here. */
export function errorResponse(
  status: number,
  error: ApiErrorCode,
  headers?: HeadersInit,
  extra?: Record<string, unknown>,
): Response {
  return json({ ...extra, error }, { status, headers });
}

export function methodNotAllowed(allowed: string[]): Response {
  return errorResponse(405, "method_not_allowed", { Allow: allowed.join(", ") });
}

/**
 * Thrown from handlers to return a safe, generic error. `fields` carries
 * per-field validation messages (written by us, never derived from exceptions).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    readonly fields?: Record<string, string>,
  ) {
    super(code);
  }

  toResponse(): Response {
    return errorResponse(this.status, this.code, undefined, this.fields ? { fields: this.fields } : undefined);
  }
}

/** Reads a small JSON request body. Rejects other content types and oversized bodies. */
export async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!/^application\/json\s*(;|$)/i.test(contentType)) {
    throw new ApiError(415, "unsupported_media_type");
  }
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new ApiError(413, "payload_too_large");

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new ApiError(413, "payload_too_large");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "bad_request");
  }
}

/**
 * CSRF defence for cookie-authenticated, state-changing requests. Browsers send
 * `Origin` on every non-GET fetch, so a mismatch means a cross-site request.
 * Combined with SameSite=Strict cookies and the JSON-only body requirement.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  if (origin !== null) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new ApiError(403, "forbidden");
    }
    if (originHost !== new URL(request.url).host) throw new ApiError(403, "forbidden");
  } else if (request.headers.get("Sec-Fetch-Site") === "cross-site") {
    throw new ApiError(403, "forbidden");
  }
}

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

/** Identifies the client for rate limiting. Cloudflare sets this header on every request. */
export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}
