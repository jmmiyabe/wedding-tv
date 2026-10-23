import { LIMITS, type InvitationView, type RsvpInput } from "../../shared/api";
import { wedding } from "../../shared/wedding";
import { hashInviteCode, normalizeInviteCode } from "../crypto";
import { loadHousehold, saveRsvp } from "../households";
import { ApiError, clientIp, json, readJson } from "../http";
import { enforceRateLimit, RATE_LIMITS } from "../rateLimit";
import type { RouteContext } from "../router";
import { clearSessionCookie, createSession, deleteSession, type GuestSession } from "../sessions";
import { Validator } from "../validate";

export function rsvpWindow(now = Date.now()) {
  const deadlinePassed = now > Date.parse(wedding.rsvp.deadline);
  return { deadlinePassed, canRespond: !deadlinePassed || wedding.rsvp.allowLateResponses };
}

/** Only what the guest needs: no ids, no admin notes, no other households. */
async function invitationView(db: D1Database, householdId: number): Promise<InvitationView> {
  const household = await loadHousehold(db, householdId);
  return {
    householdName: household.displayName,
    maxAttendees: household.maxAttendees,
    members: household.members,
    rsvp: household.rsvp,
    deadline: wedding.rsvp.deadline,
    ...rsvpWindow(),
  };
}

/** Validates an RSVP body against the household's limit. Shared with the admin endpoint. */
export function parseRsvpInput(body: unknown, maxAttendees: number): RsvpInput {
  const v = new Validator(body, ["attending", "attendees", "dietary", "message", "revision"]);
  const attending = v.boolean("attending");
  const attendees = v.names("attendees", { maxItems: LIMITS.maxAttendeesCap, maxLength: LIMITS.nameLength });
  const dietary = v.string("dietary", { max: LIMITS.dietaryLength, multiline: true });
  const message = v.string("message", { max: LIMITS.messageLength, multiline: true });
  const revision = v.nullableToken("revision");

  if (attending) {
    if (attendees.length === 0) v.addError("attendees", "Please add the name of at least one person attending.");
    if (attendees.length > maxAttendees) {
      v.addError("attendees", `Your invitation includes up to ${maxAttendees} ${maxAttendees === 1 ? "guest" : "guests"}.`);
    }
  } else if (attendees.length > 0) {
    v.addError("attendees", "Leave attendee names empty when declining.");
  }
  v.done();

  return { attending, attendees: attending ? attendees : [], dietary: attending ? dietary : "", message, revision };
}

/** POST /api/invitation/session — exchange an invitation code for a short-lived guest session. */
export async function createGuestSession({ request, env }: RouteContext) {
  await enforceRateLimit(env.DB, RATE_LIMITS.inviteCode, clientIp(request));

  const v = new Validator(await readJson(request), ["code"]);
  const raw = v.string("code", { max: 40, required: true });
  v.done();

  const code = normalizeInviteCode(raw);
  if (!code) throw new ApiError(401, "invalid_code");

  const household = await env.DB.prepare("SELECT id FROM households WHERE invite_code_hash = ?1")
    .bind(await hashInviteCode(code))
    .first<{ id: number }>();
  if (!household) throw new ApiError(401, "invalid_code");

  // Replace any session this browser already holds (e.g. for a different invitation).
  await deleteSession(env.DB, "guest", request);
  const cookie = await createSession(env.DB, "guest", request, household.id);
  return json(await invitationView(env.DB, household.id), { headers: { "Set-Cookie": cookie } });
}

/** DELETE /api/invitation/session */
export async function endGuestSession({ request, env }: RouteContext) {
  await deleteSession(env.DB, "guest", request);
  return json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie("guest", request) } });
}

/** GET /api/invitation — the signed-in guest's own invitation. */
export async function getInvitation({ env }: RouteContext, session: GuestSession) {
  return json(await invitationView(env.DB, session.householdId));
}

/** PUT /api/invitation/rsvp */
export async function submitRsvp({ request, env }: RouteContext, session: GuestSession) {
  await enforceRateLimit(env.DB, RATE_LIMITS.rsvpSubmit, `household:${session.householdId}`);
  if (!rsvpWindow().canRespond) throw new ApiError(403, "rsvp_closed");

  const household = await loadHousehold(env.DB, session.householdId);
  const input = parseRsvpInput(await readJson(request), household.maxAttendees);
  await saveRsvp(env.DB, session.householdId, input, "guest");
  return json(await invitationView(env.DB, session.householdId));
}
