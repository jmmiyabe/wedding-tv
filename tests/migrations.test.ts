import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { describe, expect, inject, it } from "vitest";
import { WRANGLER } from "./globalSetup";
import { useTestDb } from "./helpers";

const db = useTestDb();

describe("migrations", () => {
  const files = readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort();

  it("are numbered sequentially and each records its version", () => {
    files.forEach((file, index) => expect(file.startsWith(String(index + 1).padStart(4, "0") + "_")).toBe(true));
  });

  it("have all been applied and recorded", async () => {
    const row = await db.env.DB.prepare("SELECT MAX(version) AS version, COUNT(*) AS n FROM schema_migrations").first();
    expect(row).toEqual({ version: files.length, n: files.length });
  });

  it("re-applying is a no-op", () => {
    const output = execFileSync(
      process.execPath,
      [WRANGLER, "d1", "migrations", "apply", "wedding-db", "--local", "--persist-to", inject("persistDir")],
      { encoding: "utf8", env: { ...process.env, CI: "1" } },
    );
    expect(output).toMatch(/No migrations to apply/i);
  });

  it("enforces constraints at the database level", async () => {
    const DB = db.env.DB;
    await expect(DB.prepare("INSERT INTO households (display_name, max_attendees) VALUES ('X', 0)").run()).rejects.toThrow();
    await expect(DB.prepare("INSERT INTO households (display_name, max_attendees) VALUES ('', 1)").run()).rejects.toThrow();
    // Foreign keys: an RSVP needs an existing household.
    await expect(
      DB.prepare("INSERT INTO rsvps (household_id, attending, attendee_count, revision, responded_by) VALUES (999, 1, 1, 'r', 'guest')").run(),
    ).rejects.toThrow();
    // Attending must have at least one attendee; declining must have none.
    const { meta } = await DB.prepare("INSERT INTO households (display_name, max_attendees) VALUES ('X', 2)").run();
    const id = meta.last_row_id;
    await expect(
      DB.prepare("INSERT INTO rsvps (household_id, attending, attendee_count, revision, responded_by) VALUES (?1, 0, 2, 'r', 'guest')").bind(id).run(),
    ).rejects.toThrow();
  });
});
