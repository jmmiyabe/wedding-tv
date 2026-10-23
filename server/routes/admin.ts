import { LIMITS, type AdminHouseholdInput, type AdminStats } from "../../shared/api";
import { DUMMY_PASSWORD_HASH, generateInviteCode, hashInviteCode, normalizeInviteCode, verifyPassword } from "../crypto";
import { toCsv } from "../csv";
import { loadHousehold, loadHouseholds, saveRsvp } from "../households";
import { ApiError, clientIp, json, readJson } from "../http";
import { enforceRateLimit, RATE_LIMITS } from "../rateLimit";
import type { RouteContext } from "../router";
import { clearSessionCookie, createSession, deleteSession, nowIso, type AdminSession } from "../sessions";
import { parseId, Validator } from "../validate";
import { parseRsvpInput } from "./invitation";

const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_MINUTES = 15;

// ─── Authentication ─────────────────────────────────────────────────────────────

/** POST /api/admin/login */
export async function login({ request, env }: RouteContext) {
  await enforceRateLimit(env.DB, RATE_LIMITS.adminLogin, clientIp(request));

  const v = new Validator(await readJson(request), ["username", "password"]);
  const username = v.string("username", { max: LIMITS.usernameLength, required: true });
  const password = v.secret("password", LIMITS.passwordMaxLength);
  v.done();

  const admin = await env.DB.prepare(
    "SELECT id, username, password_hash, failed_logins, locked_until FROM admins WHERE username = ?1",
  )
    .bind(username)
    .first<{ id: number; username: string; password_hash: string; failed_logins: number; locked_until: string | null }>();

  // Always run the KDF so response time does not reveal whether the username exists.
  const valid = await verifyPassword(password, admin?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!admin) throw new ApiError(401, "invalid_credentials");

  const now = nowIso();
  if (admin.locked_until && admin.locked_until > now) throw new ApiError(429, "rate_limited");

  if (!valid) {
    const failures = admin.failed_logins + 1;
    const lock = failures >= LOCKOUT_THRESHOLD;
    await env.DB.prepare("UPDATE admins SET failed_logins = ?2, locked_until = ?3 WHERE id = ?1")
      .bind(admin.id, lock ? 0 : failures, lock ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString() : null)
      .run();
    throw new ApiError(401, "invalid_credentials");
  }

  await env.DB.prepare("UPDATE admins SET failed_logins = 0, locked_until = NULL WHERE id = ?1").bind(admin.id).run();
  await deleteSession(env.DB, "admin", request);
  const cookie = await createSession(env.DB, "admin", request, admin.id);
  return json({ username: admin.username }, { headers: { "Set-Cookie": cookie } });
}

/** POST /api/admin/logout */
export async function logout({ request, env }: RouteContext) {
  await deleteSession(env.DB, "admin", request);
  return json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie("admin", request) } });
}

/** GET /api/admin/session */
export async function currentAdmin(_ctx: RouteContext, session: AdminSession) {
  return json({ username: session.username });
}

// ─── Overview ───────────────────────────────────────────────────────────────────

/** GET /api/admin/stats */
export async function stats({ env }: RouteContext) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS invited,
       COALESCE(SUM(r.attending = 1), 0) AS attending,
       COALESCE(SUM(r.attending = 0), 0) AS declined,
       COALESCE(SUM(r.household_id IS NULL), 0) AS pending,
       COALESCE(SUM(h.max_attendees), 0) AS invitedSeats,
       COALESCE(SUM(r.attendee_count), 0) AS confirmedAttendees
     FROM households h LEFT JOIN rsvps r ON r.household_id = h.id`,
  ).first<Record<"invited" | "attending" | "declined" | "pending" | "invitedSeats" | "confirmedAttendees", number>>();

  const body: AdminStats = {
    households: {
      invited: row?.invited ?? 0,
      attending: row?.attending ?? 0,
      declined: row?.declined ?? 0,
      pending: row?.pending ?? 0,
    },
    people: { invitedSeats: row?.invitedSeats ?? 0, confirmedAttendees: row?.confirmedAttendees ?? 0 },
  };
  return json(body);
}

// ─── Households ─────────────────────────────────────────────────────────────────

function parseHouseholdInput(body: unknown): AdminHouseholdInput {
  const v = new Validator(body, ["displayName", "maxAttendees", "members", "notes"]);
  const input = {
    displayName: v.string("displayName", { max: LIMITS.householdNameLength, required: true }),
    maxAttendees: v.integer("maxAttendees", 1, LIMITS.maxAttendeesCap),
    members: v.names("members", { maxItems: LIMITS.maxMembers, maxLength: LIMITS.nameLength }),
    notes: v.string("notes", { max: LIMITS.notesLength, multiline: true }),
  };
  if (input.members.length > input.maxAttendees) {
    v.addError("members", "List no more named guests than the seats offered.");
  }
  v.done();
  return input;
}

function memberStatements(db: D1Database, householdId: number, members: string[]) {
  return [
    db.prepare("DELETE FROM household_members WHERE household_id = ?1").bind(householdId),
    ...members.map((name, position) =>
      db.prepare("INSERT INTO household_members (household_id, position, full_name) VALUES (?1, ?2, ?3)").bind(householdId, position, name),
    ),
  ];
}

/** Generates a code not used by any other household. */
async function newInviteCode(db: D1Database) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    const hash = await hashInviteCode(normalizeInviteCode(code)!);
    const taken = await db.prepare("SELECT 1 FROM households WHERE invite_code_hash = ?1").bind(hash).first();
    if (!taken) return { code, hash };
  }
  throw new Error("Could not generate a unique invitation code");
}

/** GET /api/admin/households */
export async function listHouseholds({ env }: RouteContext) {
  return json({ households: await loadHouseholds(env.DB) });
}

/** GET /api/admin/households/:id */
export async function getHousehold({ env, params }: RouteContext) {
  return json(await loadHousehold(env.DB, parseId(params.id)));
}

/** POST /api/admin/households — returns the new invitation code once. */
export async function createHousehold({ request, env }: RouteContext) {
  const input = parseHouseholdInput(await readJson(request));
  const { code, hash } = await newInviteCode(env.DB);

  const created = await env.DB.prepare(
    "INSERT INTO households (display_name, max_attendees, invite_code_hash, notes) VALUES (?1, ?2, ?3, ?4) RETURNING id",
  )
    .bind(input.displayName, input.maxAttendees, hash, input.notes)
    .first<{ id: number }>();
  if (!created) throw new Error("Insert returned no id");

  if (input.members.length > 0) await env.DB.batch(memberStatements(env.DB, created.id, input.members));
  return json({ household: await loadHousehold(env.DB, created.id), inviteCode: code }, { status: 201 });
}

/** PATCH /api/admin/households/:id — full replacement of the editable fields. */
export async function updateHousehold({ request, env, params }: RouteContext) {
  const id = parseId(params.id);
  const input = parseHouseholdInput(await readJson(request));

  const results = await env.DB.batch([
    // Refuse to lower the limit below an existing confirmed headcount.
    env.DB.prepare(
      `UPDATE households SET display_name = ?2, max_attendees = ?3, notes = ?4, updated_at = ?5
       WHERE id = ?1 AND ?3 >= COALESCE((SELECT attendee_count FROM rsvps WHERE household_id = ?1), 0)`,
    ).bind(id, input.displayName, input.maxAttendees, input.notes, nowIso()),
    // Members are only replaced if the update above applied.
    env.DB.prepare(
      `DELETE FROM household_members WHERE household_id = ?1
       AND ?2 >= COALESCE((SELECT attendee_count FROM rsvps WHERE household_id = ?1), 0)`,
    ).bind(id, input.maxAttendees),
    ...input.members.map((name, position) =>
      env.DB.prepare(
        `INSERT INTO household_members (household_id, position, full_name)
         SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM households WHERE id = ?1)
           AND ?4 >= COALESCE((SELECT attendee_count FROM rsvps WHERE household_id = ?1), 0)`,
      ).bind(id, position, name, input.maxAttendees),
    ),
  ]);

  if (results[0]!.meta.changes !== 1) {
    const exists = await env.DB.prepare("SELECT 1 FROM households WHERE id = ?1").bind(id).first();
    if (!exists) throw new ApiError(404, "not_found");
    throw new ApiError(409, "too_many_attendees", {
      maxAttendees: "This household has already confirmed more guests. Update their RSVP first.",
    });
  }
  return json(await loadHousehold(env.DB, id));
}

/** DELETE /api/admin/households/:id — removes the household, its RSVP and sessions. */
export async function deleteHousehold({ env, params }: RouteContext) {
  const id = parseId(params.id);
  // `meta.changes` includes cascaded rows, so check the returned row instead.
  const deleted = await env.DB.prepare("DELETE FROM households WHERE id = ?1 RETURNING id").bind(id).first();
  if (!deleted) throw new ApiError(404, "not_found");
  return json({ ok: true });
}

/** POST /api/admin/households/:id/invite-code — issue a new code; the old one stops working. */
export async function regenerateInviteCode({ env, params }: RouteContext) {
  const id = parseId(params.id);
  const { code, hash } = await newInviteCode(env.DB);
  const [update] = await env.DB.batch([
    env.DB.prepare("UPDATE households SET invite_code_hash = ?2, updated_at = ?3 WHERE id = ?1").bind(id, hash, nowIso()),
    env.DB.prepare("DELETE FROM guest_sessions WHERE household_id = ?1").bind(id),
  ]);
  if (update!.meta.changes !== 1) throw new ApiError(404, "not_found");
  return json({ household: await loadHousehold(env.DB, id), inviteCode: code });
}

/** DELETE /api/admin/households/:id/invite-code — revoke access and sign the guest out. */
export async function revokeInviteCode({ env, params }: RouteContext) {
  const id = parseId(params.id);
  const [update] = await env.DB.batch([
    env.DB.prepare("UPDATE households SET invite_code_hash = NULL, updated_at = ?2 WHERE id = ?1").bind(id, nowIso()),
    env.DB.prepare("DELETE FROM guest_sessions WHERE household_id = ?1").bind(id),
  ]);
  if (update!.meta.changes !== 1) throw new ApiError(404, "not_found");
  return json(await loadHousehold(env.DB, id));
}

/** PUT /api/admin/households/:id/rsvp — record a response on a guest's behalf (ignores the deadline). */
export async function recordRsvp({ request, env, params }: RouteContext) {
  const id = parseId(params.id);
  const household = await loadHousehold(env.DB, id);
  const input = parseRsvpInput(await readJson(request), household.maxAttendees);
  await saveRsvp(env.DB, id, input, "admin");
  return json(await loadHousehold(env.DB, id));
}

/** DELETE /api/admin/households/:id/rsvp — reset to "awaiting reply". */
export async function clearRsvp({ env, params }: RouteContext) {
  const id = parseId(params.id);
  await loadHousehold(env.DB, id);
  await env.DB.prepare("DELETE FROM rsvps WHERE household_id = ?1").bind(id).run();
  return json(await loadHousehold(env.DB, id));
}

// ─── Export ─────────────────────────────────────────────────────────────────────

const STATUS_LABEL = { pending: "Awaiting reply", attending: "Attending", declined: "Declined" } as const;

/** GET /api/admin/export.csv — invitation codes and internal ids are deliberately excluded. */
export async function exportCsv({ env }: RouteContext) {
  const households = await loadHouseholds(env.DB);
  const csv = toCsv(
    ["Household", "Status", "Seats offered", "Attending", "Attendee names", "Invited members", "Dietary requirements", "Message", "Admin notes", "Recorded by", "Last updated"],
    households.map((h) => [
      h.displayName,
      STATUS_LABEL[h.status],
      h.maxAttendees,
      h.rsvp?.attendees.length ?? 0,
      h.rsvp?.attendees.join("; ") ?? "",
      h.members.join("; "),
      h.rsvp?.dietary ?? "",
      h.rsvp?.message ?? "",
      h.notes,
      h.rsvp?.respondedBy ?? "",
      h.rsvp?.updatedAt ?? h.updatedAt,
    ]),
  );
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="wedding-rsvps-${date}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
