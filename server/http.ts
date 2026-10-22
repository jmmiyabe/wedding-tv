const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...JSON_HEADERS, ...init.headers },
  });
}

/** Generic client-facing error. Never pass raw exception messages here. */
export function errorResponse(status: number, error: string, headers?: HeadersInit): Response {
  return json({ error }, { status, headers });
}

export function methodNotAllowed(allowed: string[]): Response {
  return errorResponse(405, "method_not_allowed", { Allow: allowed.join(", ") });
}
