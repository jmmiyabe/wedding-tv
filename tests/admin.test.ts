import { describe, expect, it, vi } from "vitest";
import { wedding } from "../shared/wedding";
import { ROUTES } from "../server/router";
import { adminCookie, call, cookieFrom, createAdmin, createHousehold, guestCookie, useTestDb } from "./helpers";

const db = useTestDb();

function concretePath(path: string) {
  return path.replace(":id", "1");
}

describe("admin authorization", () => {
  const adminRoutes = ROUTES.filter((route) => route.access === "admin");

  it("protects every admin route from unauthenticated requests", async () => {
    expect(adminRoutes.length).toBeGreaterThan(10);
    const admin = await adminCookie(db.env);
    await createHousehold(db.env, admin);

    for (const route of adminRoutes) {
      for (const cookie of [null, "__Host-wedding_admin=" + "x".repeat(43), "__Host-wedding_guest=" + "x".repeat(43)]) {
        const res = await call(db.env, route.method, concretePath(route.path), {
          cookie,
          body: route.method === "GET" || route.method === "DELETE" ? undefined : {},
        });
        expect(res.status, `${route.method} ${route.path}`).toBe(401);
        expect(res.text).not.toContain("Smith");
      }
    }
  });

  it("rejects expired sessions", async () => {
    const admin = await adminCookie(db.env);
    expect((await call(db.env, "GET", "/api/admin/session", { cookie: admin })).status).toBe(200);
    await db.env.DB.prepare("UPDATE admin_sessions SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    expect((await call(db.env, "GET", "/api/admin/session", { cookie: admin })).status).toBe(401);
  });

  it("logs in, and logout invalidates the session server-side", async () => {
    const { username, password } = await createAdmin(db.env);
    const res = await call(db.env, "POST", "/api/admin/login", { body: { username: username.toUpperCase(), password } });
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie")).toMatch(/^__Host-wedding_admin=[\w-]{43}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=43200; Secure$/);
    const cookie = cookieFrom(res.headers);

    expect((await call(db.env, "GET", "/api/admin/session", { cookie })).data).toEqual({ username });
    await call(db.env, "POST", "/api/admin/logout", { cookie });
    expect((await call(db.env, "GET", "/api/admin/session", { cookie })).status).toBe(401);
  });

  it("gives the same response for an unknown user and a wrong password", async () => {
    await createAdmin(db.env);
    const wrong = await call(db.env, "POST", "/api/admin/login", { body: { username: "couple", password: "nope" } });
    const unknown = await call(db.env, "POST", "/api/admin/login", { body: { username: "ghost", password: "nope" } });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.data).toEqual(unknown.data);
  });

  it("locks an account after repeated failures, even across IP addresses", async () => {
    const { username, password } = await createAdmin(db.env);
    for (let i = 0; i < 10; i++) {
      await call(db.env, "POST", "/api/admin/login", { body: { username, password: "wrong" }, ip: `192.0.2.${i}` });
    }
    const locked = await call(db.env, "POST", "/api/admin/login", { body: { username, password }, ip: "192.0.2.200" });
    expect(locked.status).toBe(429);
  });

  it("rate-limits login attempts per IP address", async () => {
    let status = 0;
    for (let i = 0; i < 11; i++) {
      status = (await call(db.env, "POST", "/api/admin/login", { body: { username: `user${i}`, password: "x" }, ip: "192.0.2.50" })).status;
    }
    expect(status).toBe(429);
  });

  it("rejects cross-site state changes even with a valid session", async () => {
    const admin = await adminCookie(db.env);
    const res = await call(db.env, "POST", "/api/admin/households", {
      cookie: admin,
      body: { displayName: "Evil", maxAttendees: 1, members: [], notes: "" },
      headers: { Origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
    expect((await call(db.env, "GET", "/api/admin/households", { cookie: admin })).data.households).toEqual([]);
  });
});

describe("guest management", () => {
  it("creates households and shows the code only once", async () => {
    const admin = await adminCookie(db.env);
    const { household, inviteCode } = await createHousehold(db.env, admin, { members: ["Anna Smith"] });
    expect(inviteCode).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);

    const list = await call(db.env, "GET", "/api/admin/households", { cookie: admin });
    expect(list.data.households).toHaveLength(1);
    expect(list.data.households[0]).toMatchObject({ id: household.id, members: ["Anna Smith"], hasAccess: true, status: "pending" });
    expect(list.text).not.toContain(inviteCode);

    const stored = await db.env.DB.prepare("SELECT invite_code_hash FROM households").first<{ invite_code_hash: string }>();
    expect(stored!.invite_code_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("validates household input", async () => {
    const admin = await adminCookie(db.env);
    const res = await call(db.env, "POST", "/api/admin/households", {
      cookie: admin,
      body: { displayName: " ", maxAttendees: 0, members: ["A", "B"], notes: "" },
    });
    expect(res.status).toBe(400);
    expect(Object.keys(res.data.fields).sort()).toEqual(["displayName", "maxAttendees", "members"]);
  });

  it("refuses to lower the limit below a confirmed headcount", async () => {
    const admin = await adminCookie(db.env);
    const { household, inviteCode } = await createHousehold(db.env, admin, { maxAttendees: 3, members: ["A"] });
    const guest = await guestCookie(db.env, inviteCode);
    await call(db.env, "PUT", "/api/invitation/rsvp", {
      cookie: guest,
      body: { attending: true, attendees: ["A", "B", "C"], dietary: "", message: "", revision: null },
    });

    const lower = await call(db.env, "PATCH", `/api/admin/households/${household.id}`, {
      cookie: admin,
      body: { displayName: "Renamed", maxAttendees: 2, members: [], notes: "" },
    });
    expect(lower.status).toBe(409);
    const unchanged = await call(db.env, "GET", `/api/admin/households/${household.id}`, { cookie: admin });
    expect(unchanged.data).toMatchObject({ displayName: "The Smith Family", maxAttendees: 3, members: ["A"] });

    const ok = await call(db.env, "PATCH", `/api/admin/households/${household.id}`, {
      cookie: admin,
      body: { displayName: "Renamed", maxAttendees: 4, members: ["X", "Y"], notes: "note" },
    });
    expect(ok.status).toBe(200);
    expect(ok.data).toMatchObject({ displayName: "Renamed", maxAttendees: 4, members: ["X", "Y"], notes: "note" });
  });

  it("records RSVPs manually, ignoring the deadline but not the limit", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.parse(wedding.rsvp.deadline) + 86_400_000));
    try {
      const admin = await adminCookie(db.env);
      const { household } = await createHousehold(db.env, admin, { maxAttendees: 2 });
      const path = `/api/admin/households/${household.id}/rsvp`;
      const tooMany = await call(db.env, "PUT", path, {
        cookie: admin,
        body: { attending: true, attendees: ["A", "B", "C"], dietary: "", message: "", revision: null },
      });
      expect(tooMany.status).toBe(400);

      const res = await call(db.env, "PUT", path, {
        cookie: admin,
        body: { attending: true, attendees: ["A", "B"], dietary: "Nut allergy", message: "", revision: null },
      });
      expect(res.status).toBe(200);
      expect(res.data).toMatchObject({ status: "attending", rsvp: { respondedBy: "admin", attendees: ["A", "B"] } });

      const cleared = await call(db.env, "DELETE", path, { cookie: admin });
      expect(cleared.data.status).toBe("pending");
    } finally {
      vi.useRealTimers();
    }
  });

  it("deletes a household with its response and sessions", async () => {
    const admin = await adminCookie(db.env);
    const { household, inviteCode } = await createHousehold(db.env, admin);
    const guest = await guestCookie(db.env, inviteCode);
    await call(db.env, "PUT", "/api/invitation/rsvp", {
      cookie: guest,
      body: { attending: true, attendees: ["A"], dietary: "", message: "", revision: null },
    });

    expect((await call(db.env, "DELETE", `/api/admin/households/${household.id}`, { cookie: admin })).status).toBe(200);
    for (const table of ["households", "rsvps", "rsvp_attendees", "guest_sessions"]) {
      expect((await db.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n, table).toBe(0);
    }
    expect((await call(db.env, "GET", "/api/invitation", { cookie: guest })).status).toBe(401);
    expect((await call(db.env, "DELETE", `/api/admin/households/${household.id}`, { cookie: admin })).status).toBe(404);
  });

  it("separates household and individual counts in the overview", async () => {
    const admin = await adminCookie(db.env);
    const a = await createHousehold(db.env, admin, { displayName: "A", maxAttendees: 4 });
    const b = await createHousehold(db.env, admin, { displayName: "B", maxAttendees: 2 });
    await createHousehold(db.env, admin, { displayName: "C", maxAttendees: 1 });
    const rsvp = (attending: boolean, attendees: string[]) => ({ attending, attendees, dietary: "", message: "", revision: null });
    await call(db.env, "PUT", `/api/admin/households/${a.household.id}/rsvp`, { cookie: admin, body: rsvp(true, ["1", "2", "3"]) });
    await call(db.env, "PUT", `/api/admin/households/${b.household.id}/rsvp`, { cookie: admin, body: rsvp(false, []) });

    const stats = await call(db.env, "GET", "/api/admin/stats", { cookie: admin });
    expect(stats.data).toEqual({
      households: { invited: 3, attending: 1, declined: 1, pending: 1 },
      people: { invitedSeats: 7, confirmedAttendees: 3 },
    });
  });
});

describe("CSV export", () => {
  it("requires an administrator", async () => {
    const res = await call(db.env, "GET", "/api/admin/export.csv");
    expect(res.status).toBe(401);
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("neutralises spreadsheet formulas and excludes secrets", async () => {
    const admin = await adminCookie(db.env);
    const { household, inviteCode } = await createHousehold(db.env, admin, {
      displayName: '=HYPERLINK("http://evil.example","click")',
      maxAttendees: 2,
      members: ["+Anna"],
    });
    await call(db.env, "PUT", `/api/admin/households/${household.id}/rsvp`, {
      cookie: admin,
      body: { attending: true, attendees: ["@Ben", "-Cara"], dietary: 'Says "no nuts"', message: "", revision: null },
    });

    const res = await call(db.env, "GET", "/api/admin/export.csv", { cookie: admin });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="wedding-rsvps-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const lines = res.text.replace(String.fromCharCode(0xfeff), "").trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
    expect(lines[1]).toContain(`"'@Ben; -Cara"`);
    expect(lines[1]).toContain(`"'+Anna"`);
    expect(lines[1]).toContain(`"Says ""no nuts"""`);
    expect(res.text).not.toContain(inviteCode);
    expect(res.text).not.toMatch(/[0-9a-f]{64}/);
  });
});
