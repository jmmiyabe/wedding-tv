import type { Env } from "./env";
import { ApiError, assertSameOrigin, errorResponse, methodNotAllowed } from "./http";
import * as admin from "./routes/admin";
import * as invitation from "./routes/invitation";
import { getAdminSession, getGuestSession, type AdminSession, type GuestSession } from "./sessions";

export interface RouteContext {
  request: Request;
  env: Env;
  params: Record<string, string>;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Every API route and who may call it. Access is enforced here, before any
 * handler runs, so a handler cannot forget to check:
 *
 * - `public`  — anyone (rate-limited where it matters)
 * - `guest`   — a valid guest session for a household whose access is not revoked;
 *               the handler only receives that household's id
 * - `admin`   — a valid administrator session
 *
 * `/api/health` is a separate Pages Function and is public.
 */
type Route =
  | { method: Method; path: string; access: "public"; handler: (ctx: RouteContext) => Promise<Response> }
  | { method: Method; path: string; access: "guest"; handler: (ctx: RouteContext, s: GuestSession) => Promise<Response> }
  | { method: Method; path: string; access: "admin"; handler: (ctx: RouteContext, s: AdminSession) => Promise<Response> };

export const ROUTES: Route[] = [
  { method: "POST", path: "/api/invitation/session", access: "public", handler: invitation.createGuestSession },
  { method: "DELETE", path: "/api/invitation/session", access: "public", handler: invitation.endGuestSession },
  { method: "GET", path: "/api/invitation", access: "guest", handler: invitation.getInvitation },
  { method: "PUT", path: "/api/invitation/rsvp", access: "guest", handler: invitation.submitRsvp },

  { method: "POST", path: "/api/admin/login", access: "public", handler: admin.login },
  { method: "POST", path: "/api/admin/logout", access: "public", handler: admin.logout },
  { method: "GET", path: "/api/admin/session", access: "admin", handler: admin.currentAdmin },
  { method: "GET", path: "/api/admin/stats", access: "admin", handler: admin.stats },
  { method: "GET", path: "/api/admin/households", access: "admin", handler: admin.listHouseholds },
  { method: "POST", path: "/api/admin/households", access: "admin", handler: admin.createHousehold },
  { method: "GET", path: "/api/admin/households/:id", access: "admin", handler: admin.getHousehold },
  { method: "PATCH", path: "/api/admin/households/:id", access: "admin", handler: admin.updateHousehold },
  { method: "DELETE", path: "/api/admin/households/:id", access: "admin", handler: admin.deleteHousehold },
  { method: "POST", path: "/api/admin/households/:id/invite-code", access: "admin", handler: admin.regenerateInviteCode },
  { method: "DELETE", path: "/api/admin/households/:id/invite-code", access: "admin", handler: admin.revokeInviteCode },
  { method: "PUT", path: "/api/admin/households/:id/rsvp", access: "admin", handler: admin.recordRsvp },
  { method: "DELETE", path: "/api/admin/households/:id/rsvp", access: "admin", handler: admin.clearRsvp },
  { method: "GET", path: "/api/admin/export.csv", access: "admin", handler: admin.exportCsv },
];

function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split("/");
  const pathParts = pathname.replace(/\/+$/, "").split("/");
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const expected = patternParts[i]!;
    const actual = pathParts[i]!;
    if (expected.startsWith(":")) params[expected.slice(1)] = actual;
    else if (expected !== actual) return null;
  }
  return params;
}

async function dispatch(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  const candidates = ROUTES.map((route) => ({ route, params: matchPath(route.path, pathname) })).filter(
    (c): c is { route: Route; params: Record<string, string> } => c.params !== null,
  );
  if (candidates.length === 0) return errorResponse(404, "not_found");

  const method = request.method === "HEAD" ? "GET" : request.method;
  const match = candidates.find((c) => c.route.method === method);
  if (!match) return methodNotAllowed(candidates.map((c) => c.route.method));

  if (method !== "GET") assertSameOrigin(request);

  const ctx: RouteContext = { request, env, params: match.params };
  const { route } = match;
  switch (route.access) {
    case "public":
      return route.handler(ctx);
    case "guest": {
      const session = await getGuestSession(env.DB, request);
      if (!session) throw new ApiError(401, "unauthorized");
      return route.handler(ctx, session);
    }
    case "admin": {
      const session = await getAdminSession(env.DB, request);
      if (!session) throw new ApiError(401, "unauthorized");
      return route.handler(ctx, session);
    }
  }
}

export async function handleApiRequest(request: Request, env: Env): Promise<Response> {
  try {
    return await dispatch(request, env);
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    // Message only: never log request bodies, guest details or bound SQL values.
    console.error("Unhandled API error:", error instanceof Error ? error.message : "unknown");
    return errorResponse(500, "server_error");
  }
}
