import type { AdminHousehold, RsvpInput, RsvpResponse, RsvpStatus } from "../shared/api";
import { randomToken } from "./crypto";
import { ApiError } from "./http";
import { nowIso } from "./sessions";

interface HouseholdRow {
  id: number;
  display_name: string;
  max_attendees: number;
  has_access: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

interface RsvpRow {
  household_id: number;
  attending: number;
  dietary: string;
  message: string;
  revision: string;
  responded_by: "guest" | "admin";
  updated_at: string;
}

interface NameRow {
  household_id: number;
  full_name: string;
}

const HOUSEHOLD_COLUMNS = `id, display_name, max_attendees, (invite_code_hash IS NOT NULL) AS has_access,
  notes, created_at, updated_at`;

function groupNames(rows: NameRow[]) {
  const map = new Map<number, string[]>();
  for (const row of rows) {
    const list = map.get(row.household_id);
    if (list) list.push(row.full_name);
    else map.set(row.household_id, [row.full_name]);
  }
  return map;
}

function toRsvp(row: RsvpRow | undefined, attendees: string[] | undefined): RsvpResponse | null {
  if (!row) return null;
  return {
    attending: row.attending === 1,
    attendees: attendees ?? [],
    dietary: row.dietary,
    message: row.message,
    revision: row.revision,
    respondedBy: row.responded_by,
    updatedAt: row.updated_at,
  };
}

export function rsvpStatus(rsvp: RsvpResponse | null): RsvpStatus {
  if (!rsvp) return "pending";
  return rsvp.attending ? "attending" : "declined";
}

/**
 * Loads households with members and responses. With `householdId`, every query is
 * scoped to that one household — guest endpoints always pass it.
 */
export async function loadHouseholds(db: D1Database, householdId?: number): Promise<AdminHousehold[]> {
  const scoped = householdId !== undefined;
  const where = (column: string) => (scoped ? ` WHERE ${column} = ?1` : "");
  const bind = (statement: D1PreparedStatement) => (scoped ? statement.bind(householdId) : statement);

  const [households, members, rsvps, attendees] = await db.batch([
    bind(db.prepare(`SELECT ${HOUSEHOLD_COLUMNS} FROM households${where("id")} ORDER BY display_name COLLATE NOCASE, id`)),
    bind(db.prepare(`SELECT household_id, full_name FROM household_members${where("household_id")} ORDER BY household_id, position`)),
    bind(db.prepare(`SELECT household_id, attending, dietary, message, revision, responded_by, updated_at FROM rsvps${where("household_id")}`)),
    bind(db.prepare(`SELECT household_id, full_name FROM rsvp_attendees${where("household_id")} ORDER BY household_id, position`)),
  ]);

  const membersByHousehold = groupNames(members!.results as unknown as NameRow[]);
  const attendeesByHousehold = groupNames(attendees!.results as unknown as NameRow[]);
  const rsvpByHousehold = new Map((rsvps!.results as unknown as RsvpRow[]).map((row) => [row.household_id, row]));

  return (households!.results as unknown as HouseholdRow[]).map((row) => {
    const rsvp = toRsvp(rsvpByHousehold.get(row.id), attendeesByHousehold.get(row.id));
    return {
      id: row.id,
      displayName: row.display_name,
      maxAttendees: row.max_attendees,
      members: membersByHousehold.get(row.id) ?? [],
      notes: row.notes,
      hasAccess: row.has_access === 1,
      status: rsvpStatus(rsvp),
      rsvp,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export async function loadHousehold(db: D1Database, householdId: number): Promise<AdminHousehold> {
  const [household] = await loadHouseholds(db, householdId);
  if (!household) throw new ApiError(404, "not_found");
  return household;
}

/**
 * Creates or replaces a household's RSVP atomically (D1 batches run in one
 * transaction).
 *
 * - First response: `revision` must be null; inserting when a response already
 *   exists is a conflict, so two first submissions cannot both win.
 * - Update: `revision` must match the stored one (optimistic concurrency), so a
 *   stale tab cannot silently overwrite a newer answer.
 * - The attendee limit is re-checked inside the write itself, so it holds even if
 *   an administrator lowers it concurrently.
 * - Attendee rows are only rewritten when the response row now carries this
 *   request's new revision; otherwise the batch changes nothing.
 */
export async function saveRsvp(
  db: D1Database,
  householdId: number,
  input: RsvpInput,
  respondedBy: "guest" | "admin",
): Promise<void> {
  const attendees = input.attending ? input.attendees : [];
  const count = attendees.length;
  const newRevision = randomToken(16);
  const now = nowIso();
  const values = [householdId, input.attending ? 1 : 0, count, input.dietary, input.message, newRevision, respondedBy, now];

  const write =
    input.revision === null
      ? db
          .prepare(
            `INSERT INTO rsvps (household_id, attending, attendee_count, dietary, message, revision, responded_by, created_at, updated_at)
             SELECT id, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8 FROM households WHERE id = ?1 AND max_attendees >= ?3
             ON CONFLICT (household_id) DO NOTHING`,
          )
          .bind(...values)
      : db
          .prepare(
            `UPDATE rsvps SET attending = ?2, attendee_count = ?3, dietary = ?4, message = ?5, revision = ?6,
               responded_by = ?7, updated_at = ?8
             WHERE household_id = ?1 AND revision = ?9
               AND ?3 <= (SELECT max_attendees FROM households WHERE id = ?1)`,
          )
          .bind(...values, input.revision);

  const ownsRevision = "EXISTS (SELECT 1 FROM rsvps WHERE household_id = ?1 AND revision = ?2)";
  const results = await db.batch([
    write,
    db.prepare(`DELETE FROM rsvp_attendees WHERE household_id = ?1 AND ${ownsRevision}`).bind(householdId, newRevision),
    ...attendees.map((name, position) =>
      db
        .prepare(`INSERT INTO rsvp_attendees (household_id, position, full_name) SELECT ?1, ?3, ?4 WHERE ${ownsRevision}`)
        .bind(householdId, newRevision, position, name),
    ),
  ]);

  if (results[0]!.meta.changes === 1) return;

  // Nothing was written. Work out why, for a precise error.
  const state = await db
    .prepare(
      `SELECT h.max_attendees AS max, r.revision AS revision
       FROM households h LEFT JOIN rsvps r ON r.household_id = h.id WHERE h.id = ?1`,
    )
    .bind(householdId)
    .first<{ max: number; revision: string | null }>();
  if (!state) throw new ApiError(404, "not_found");
  if (count > state.max) throw new ApiError(422, "too_many_attendees");
  throw new ApiError(409, "conflict");
}
