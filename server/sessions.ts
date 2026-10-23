import { randomToken, sha256Hex } from "./crypto";
import { getCookie } from "./http";

/**
 * Server-side sessions for guests and administrators. The cookie holds a random
 * 256-bit token; D1 stores only its SHA-256, so a database leak cannot be
 * replayed as a live session. Cookies are HttpOnly + SameSite=Strict, and on
 * HTTPS use the `__Host-` prefix (Secure, Path=/, no Domain).
 */

export type SessionKind = "guest" | "admin";

export const SESSION_TTL_SECONDS: Record<SessionKind, number> = {
  guest: 24 * 60 * 60,
  admin: 12 * 60 * 60,
};

const TABLE = { guest: "guest_sessions", admin: "admin_sessions" } as const;
const OWNER_COLUMN = { guest: "household_id", admin: "admin_id" } as const;

function isSecure(request: Request) {
  return new URL(request.url).protocol === "https:";
}

function cookieName(kind: SessionKind, request: Request) {
  // `__Host-` cookies must be Secure, which browsers reject on plain-HTTP local dev.
  return isSecure(request) ? `__Host-wedding_${kind}` : `wedding_${kind}`;
}

function serializeCookie(kind: SessionKind, request: Request, value: string, maxAge: number) {
  const parts = [`${cookieName(kind, request)}=${value}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAge}`];
  if (isSecure(request)) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(kind: SessionKind, request: Request): string {
  return serializeCookie(kind, request, "", 0);
}

export function nowIso() {
  return new Date().toISOString();
}

/** Creates a session and returns the `Set-Cookie` header value. */
export async function createSession(
  db: D1Database,
  kind: SessionKind,
  request: Request,
  ownerId: number,
): Promise<string> {
  const token = randomToken();
  const ttl = SESSION_TTL_SECONDS[kind];
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();

  await db.batch([
    // Expired sessions are pruned here instead of by a scheduled job.
    db.prepare(`DELETE FROM ${TABLE[kind]} WHERE expires_at <= ?1`).bind(nowIso()),
    db
      .prepare(`INSERT INTO ${TABLE[kind]} (token_hash, ${OWNER_COLUMN[kind]}, expires_at) VALUES (?1, ?2, ?3)`)
      .bind(await sha256Hex(token), ownerId, expiresAt),
  ]);

  return serializeCookie(kind, request, token, ttl);
}

/** Returns the hashed session token from the request cookie, if it is well-formed. */
export async function sessionTokenHash(kind: SessionKind, request: Request): Promise<string | null> {
  const token = getCookie(request, cookieName(kind, request));
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return sha256Hex(token);
}

export async function deleteSession(db: D1Database, kind: SessionKind, request: Request): Promise<void> {
  const hash = await sessionTokenHash(kind, request);
  if (hash) await db.prepare(`DELETE FROM ${TABLE[kind]} WHERE token_hash = ?1`).bind(hash).run();
}

export interface GuestSession {
  householdId: number;
}

/** Valid only while unexpired AND the household's invitation access has not been revoked. */
export async function getGuestSession(db: D1Database, request: Request): Promise<GuestSession | null> {
  const hash = await sessionTokenHash("guest", request);
  if (!hash) return null;
  const row = await db
    .prepare(
      `SELECT s.household_id AS householdId
       FROM guest_sessions s JOIN households h ON h.id = s.household_id
       WHERE s.token_hash = ?1 AND s.expires_at > ?2 AND h.invite_code_hash IS NOT NULL`,
    )
    .bind(hash, nowIso())
    .first<GuestSession>();
  return row ?? null;
}

export interface AdminSession {
  adminId: number;
  username: string;
}

export async function getAdminSession(db: D1Database, request: Request): Promise<AdminSession | null> {
  const hash = await sessionTokenHash("admin", request);
  if (!hash) return null;
  const row = await db
    .prepare(
      `SELECT a.id AS adminId, a.username AS username
       FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
       WHERE s.token_hash = ?1 AND s.expires_at > ?2`,
    )
    .bind(hash, nowIso())
    .first<AdminSession>();
  return row ?? null;
}
