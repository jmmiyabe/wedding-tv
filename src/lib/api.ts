import type { ApiErrorCode } from "../../shared/api";

export type ClientErrorCode = ApiErrorCode | "network";

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    readonly fields: Record<string, string> = {},
  ) {
    super(code);
  }
}

/** JSON fetch for same-origin API calls. Cookies are HttpOnly and sent automatically. */
export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      credentials: "same-origin",
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiClientError(0, "network");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const code = (data && typeof data.error === "string" ? data.error : "server_error") as ClientErrorCode;
    throw new ApiClientError(response.status, code, data?.fields ?? {});
  }
  return data as T;
}

const MESSAGES: Partial<Record<ClientErrorCode, string>> = {
  network: "We couldn't reach the server. Please check your connection and try again.",
  rate_limited: "Too many attempts. Please wait about 15 minutes and try again.",
  server_error: "Something went wrong on our side. Please try again in a moment.",
  validation_failed: "Please check the highlighted fields.",
  conflict: "This reply was changed somewhere else in the meantime. We've loaded the latest version — please review it.",
  rsvp_closed: "The RSVP deadline has passed, so replies can no longer be changed online.",
  too_many_attendees: "That's more guests than this invitation includes.",
  unauthorized: "Your session has expired. Please sign in again.",
  forbidden: "That request was blocked for security reasons. Please reload the page and try again.",
};

export function errorMessage(error: unknown): string {
  const code = error instanceof ApiClientError ? error.code : "server_error";
  return MESSAGES[code] ?? MESSAGES.server_error!;
}
