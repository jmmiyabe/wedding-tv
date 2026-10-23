import { afterEach, describe, expect, it, vi } from "vitest";
import { wedding } from "../shared/wedding";
import { adminCookie, call, cookieFrom, createHousehold, guestCookie, useTestDb } from "./helpers";

const db = useTestDb();

const attending = (attendees: string[], revision: string | null = null) => ({
  attending: true,
  attendees,
  dietary: "",
  message: "",
  revision,
});

afterEach(() => {
  vi.useRealTimers();
  (wedding.rsvp as { allowLateResponses: boolean }).allowLateResponses = false;
});

describe("invitation verification", () => {
  it("rejects unknown and malformed codes without revealing anything", async () => {
    const admin = await adminCookie(db.env);
    await createHousehold(db.env, admin);

    for (const code of ["ABCD-EFGH-JKMN", "nope", "", "' OR 1=1 --"]) {
      const res = await call(db.env, "POST", "/api/invitation/session", { body: { code } });
      expect([400, 401]).toContain(res.status);
      expect(res.headers.get("Set-Cookie")).toBeNull();
      expect(Object.keys(res.data).sort()).toEqual(res.status === 400 ? ["error", "fields"] : ["error"]);
    }
  });

  it("accepts a valid code in any reasonable format and returns only that household's view", async () => {
    const admin = await adminCookie(db.env);
    const { inviteCode } = await createHousehold(db.env, admin, {
      displayName: "The Smith Family",
      maxAttendees: 3,
      members: ["Anna Smith", "Ben Smith"],
      notes: "Private admin note",
    });

    const typed = ` ${inviteCode.toLowerCase().replace(/-/g, " ")} `;
    const res = await call(db.env, "POST", "/api/invitation/session", { body: { code: typed } });
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toMatch(/^__Host-wedding_guest=[\w-]{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=\d+; Secure$/);
    expect(res.data).toMatchObject({ householdName: "The Smith Family", maxAttendees: 3, members: ["Anna Smith", "Ben Smith"], rsvp: null });
    expect(res.text).not.toContain("Private admin note");
    expect(res.data).not.toHaveProperty("id");
  });

  it("requires a guest session to read invitation details", async () => {
    expect((await call(db.env, "GET", "/api/invitation")).status).toBe(401);
    expect((await call(db.env, "GET", "/api/invitation", { cookie: "__Host-wedding_guest=forged" })).status).toBe(401);
    const forged = "__Host-wedding_guest=" + "a".repeat(43);
    expect((await call(db.env, "GET", "/api/invitation", { cookie: forged })).status).toBe(401);
  });

  it("rate-limits code attempts per client", async () => {
    let last = 0;
    for (let i = 0; i < 21; i++) {
      last = (await call(db.env, "POST", "/api/invitation/session", { body: { code: "AAAA-AAAA-AAAA" }, ip: "198.51.100.7" })).status;
    }
    expect(last).toBe(429);
    // A different client is unaffected.
    expect((await call(db.env, "POST", "/api/invitation/session", { body: { code: "AAAA-AAAA-AAAA" }, ip: "198.51.100.8" })).status).toBe(401);
  });

  it("stops working after access is revoked or the code is regenerated", async () => {
    const admin = await adminCookie(db.env);
    const { household, inviteCode } = await createHousehold(db.env, admin);
    const guest = await guestCookie(db.env, inviteCode);

    const regen = await call(db.env, "POST", `/api/admin/households/${household.id}/invite-code`, { cookie: admin });
    expect(regen.status).toBe(200);
    expect((await call(db.env, "GET", "/api/invitation", { cookie: guest })).status).toBe(401);
    expect((await call(db.env, "POST", "/api/invitation/session", { body: { code: inviteCode } })).status).toBe(401);

    const fresh = await guestCookie(db.env, regen.data.inviteCode);
    await call(db.env, "DELETE", `/api/admin/households/${household.id}/invite-code`, { cookie: admin });
    expect((await call(db.env, "GET", "/api/invitation", { cookie: fresh })).status).toBe(401);
    expect((await call(db.env, "POST", "/api/invitation/session", { body: { code: regen.data.inviteCode } })).status).toBe(401);
  });

  it("ends the session on sign-out", async () => {
    const admin = await adminCookie(db.env);
    const { inviteCode } = await createHousehold(db.env, admin);
    const guest = await guestCookie(db.env, inviteCode);
    const res = await call(db.env, "DELETE", "/api/invitation/session", { cookie: guest });
    expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect((await call(db.env, "GET", "/api/invitation", { cookie: guest })).status).toBe(401);
  });
});

describe("RSVP submission", () => {
  async function setup(maxAttendees = 2) {
    const admin = await adminCookie(db.env);
    const created = await createHousehold(db.env, admin, { maxAttendees });
    return { admin, id: created.household.id, guest: await guestCookie(db.env, created.inviteCode) };
  }

  it("persists a response in D1", async () => {
    const { id, guest } = await setup();
    const res = await call(db.env, "PUT", "/api/invitation/rsvp", {
      cookie: guest,
      body: { attending: true, attendees: ["Anna Smith", "Ben Smith"], dietary: "Vegetarian", message: "Can't wait!", revision: null },
    });
    expect(res.status).toBe(200);
    expect(res.data.rsvp).toMatchObject({ attending: true, attendees: ["Anna Smith", "Ben Smith"], dietary: "Vegetarian", respondedBy: "guest" });

    const row = await db.env.DB.prepare("SELECT attending, attendee_count, dietary, message FROM rsvps WHERE household_id = ?1").bind(id).first();
    expect(row).toEqual({ attending: 1, attendee_count: 2, dietary: "Vegetarian", message: "Can't wait!" });
    const names = await db.env.DB.prepare("SELECT full_name FROM rsvp_attendees WHERE household_id = ?1 ORDER BY position").bind(id).all();
    expect(names.results.map((r) => r.full_name)).toEqual(["Anna Smith", "Ben Smith"]);
  });

  it("enforces the attendee limit on the server", async () => {
    const { id, guest } = await setup(2);
    const res = await call(db.env, "PUT", "/api/invitation/rsvp", { cookie: guest, body: attending(["A", "B", "C"]) });
    expect(res.status).toBe(400);
    expect(res.data.fields.attendees).toMatch(/up to 2/);
    expect(await db.env.DB.prepare("SELECT 1 FROM rsvps WHERE household_id = ?1").bind(id).first()).toBeNull();
  });

  it("rejects attending with nobody, and names when declining", async () => {
    const { guest } = await setup();
    expect((await call(db.env, "PUT", "/api/invitation/rsvp", { cookie: guest, body: attending([]) })).status).toBe(400);
    const decline = { attending: false, attendees: ["Someone"], dietary: "", message: "", revision: null };
    expect((await call(db.env, "PUT", "/api/invitation/rsvp", { cookie: guest, body: decline })).status).toBe(400);
  });

  it("rejects duplicate first submissions and stale updates", async () => {
    const { guest } = await setup();
    const first = await call(db.env, "PUT", "/api/invitation/rsvp", { cookie: guest, body: attending(["Anna"]) });
    expect(first.status).toBe(200);

    const duplicate = await call(db.env, "PUT", "/api/invitation/rsvp", { cookie: guest, body: attending(["Anna", "Ben"]) });
    expect(duplicate.status).toBe(409);

    const revision = first.data.rsvp.revision;
    const update = await call(db.env, "PUT", "/api/invitation/rsvp", {
      cookie: guest,
      body: { attending: false, attendees: [], dietary: "", message: "Sorry!", revision },
    });
    expect(update.status).toBe(200);
    expect(update.data.rsvp).toMatchObject({ attending: false, attendees: [] });

    const stale = await call(db.env, "PUT", "/api/invitation/rsvp", { cookie: guest, body: attending(["Anna"], revision) });
    expect(stale.status).toBe(409);
    // The newer answer survived.
    expect((await call(db.env, "GET", "/api/invitation", { cookie: guest })).data.rsvp.attending).toBe(false);
  });

  it("keeps the existing response when a submission fails", async () => {
    const { guest } = await setup(2);
    const first = await call(db.env, "PUT", "/api/invitation/rsvp", { cookie: guest, body: attending(["Anna", "Ben"]) });
    const bad = await call(db.env, "PUT", "/api/invitation/rsvp", {
      cookie: guest,
      body: attending(["Anna", "Ben", "Cara"], first.data.rsvp.revision),
    });
    expect(bad.status).toBe(400);
    const current = await call(db.env, "GET", "/api/invitation", { cookie: guest });
    expect(current.data.rsvp).toEqual(first.data.rsvp);
  });

  it("cannot read or change another household's response", async () => {
    const admin = await adminCookie(db.env);
    const a = await createHousehold(db.env, admin, { displayName: "Household A" });
    const b = await createHousehold(db.env, admin, { displayName: "Household B" });
    const guestA = await guestCookie(db.env, a.inviteCode);
    const guestB = await guestCookie(db.env, b.inviteCode);
    await call(db.env, "PUT", "/api/invitation/rsvp", { cookie: guestB, body: attending(["Bea"]) });

    const view = await call(db.env, "GET", "/api/invitation", { cookie: guestA });
    expect(view.data.householdName).toBe("Household A");
    expect(view.text).not.toContain("Household B");
    expect(view.text).not.toContain("Bea");

    // Smuggling another household's id is rejected outright.
    const smuggled = await call(db.env, "PUT", "/api/invitation/rsvp", {
      cookie: guestA,
      body: { ...attending(["Mallory"]), householdId: b.household.id },
    });
    expect(smuggled.status).toBe(400);
    const bRow = await db.env.DB.prepare("SELECT full_name FROM rsvp_attendees WHERE household_id = ?1").bind(b.household.id).all();
    expect(bRow.results).toEqual([{ full_name: "Bea" }]);

    // Guests cannot use admin endpoints.
    expect((await call(db.env, "GET", "/api/admin/households", { cookie: guestA })).status).toBe(401);
  });

  it("refuses responses after the deadline unless late responses are allowed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.parse(wedding.rsvp.deadline) + 60_000));
    const { guest } = await setup();

    const late = await call(db.env, "PUT", "/api/invitation/rsvp", { cookie: guest, body: attending(["Anna"]) });
    expect(late.status).toBe(403);
    expect(late.data.error).toBe("rsvp_closed");
    expect((await call(db.env, "GET", "/api/invitation", { cookie: guest })).data).toMatchObject({ deadlinePassed: true, canRespond: false });

    (wedding.rsvp as { allowLateResponses: boolean }).allowLateResponses = true;
    expect((await call(db.env, "PUT", "/api/invitation/rsvp", { cookie: guest, body: attending(["Anna"]) })).status).toBe(200);
  });

  it("rejects cross-site and non-JSON requests", async () => {
    const { guest } = await setup();
    const crossSite = await call(db.env, "PUT", "/api/invitation/rsvp", {
      cookie: guest,
      body: attending(["Anna"]),
      headers: { Origin: "https://evil.example" },
    });
    expect(crossSite.status).toBe(403);

    const form = await call(db.env, "PUT", "/api/invitation/rsvp", {
      cookie: guest,
      body: "attending=true",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(form.status).toBe(415);

    const sameOrigin = await call(db.env, "PUT", "/api/invitation/rsvp", {
      cookie: guest,
      body: attending(["Anna"]),
      headers: { Origin: "https://wedding.test" },
    });
    expect(sameOrigin.status).toBe(200);
  });

  it("uses non-__Host cookies on plain-HTTP local development", async () => {
    const admin = await adminCookie(db.env);
    const { inviteCode } = await createHousehold(db.env, admin);
    const { handleApiRequest } = await import("../server/router");
    const res = await handleApiRequest(
      new Request("http://localhost:8788/api/invitation/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: inviteCode }),
      }),
      db.env,
    );
    expect(res.status).toBe(200);
    const cookie = res.headers.get("Set-Cookie")!;
    expect(cookie).toMatch(/^wedding_guest=/);
    expect(cookie).not.toContain("Secure");
    expect(cookieFrom(res.headers)).toMatch(/^wedding_guest=/);
  });
});
