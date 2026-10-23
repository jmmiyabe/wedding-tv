import { sha256Hex } from "./crypto";
import { ApiError } from "./http";

export interface RateLimitRule {
  scope: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  /** Invitation code attempts per IP address. */
  inviteCode: { scope: "invite", limit: 20, windowSeconds: 15 * 60 },
  /** RSVP submissions per household. */
  rsvpSubmit: { scope: "rsvp", limit: 30, windowSeconds: 15 * 60 },
  /** Admin login attempts per IP address (per-account lockout is separate). */
  adminLogin: { scope: "login", limit: 10, windowSeconds: 15 * 60 },
} satisfies Record<string, RateLimitRule>;

/**
 * Fixed-window counter in D1. Identifiers (IP addresses, ids) are hashed before
 * storage so the table holds no raw personal data. Throws 429 when exceeded.
 */
export async function enforceRateLimit(db: D1Database, rule: RateLimitRule, identifier: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % rule.windowSeconds);
  const key = `${rule.scope}:${await sha256Hex(identifier)}`;

  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN window_start = ?2 THEN count + 1 ELSE 1 END,
         window_start = ?2
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();

  // Opportunistic cleanup keeps the table tiny without a scheduled job.
  if (Math.random() < 0.05) {
    await db.prepare("DELETE FROM rate_limits WHERE window_start < ?1").bind(now - 86_400).run();
  }

  if ((row?.count ?? 0) > rule.limit) {
    throw new ApiError(429, "rate_limited");
  }
}
