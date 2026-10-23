#!/usr/bin/env node
/**
 * Fills the LOCAL development database with sample households so the RSVP flow
 * and dashboard can be tried out. It refuses to touch production: it always runs
 * with --local, and there is no flag to change that.
 *
 *   pnpm db:seed:local
 *
 * Re-running replaces the sample data (and only rows named "[Sample] …").
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER = join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js");

if (process.argv.includes("--remote")) {
  console.error("Refusing: sample data must never be written to the production database.");
  process.exit(1);
}

// Fixed, obviously fake codes for local testing only. Same hashing as server/crypto.ts.
const hashCode = (code) => createHash("sha256").update(`invite:${code.replace(/-/g, "")}`).digest("hex");
const esc = (value) => `'${String(value).replace(/'/g, "''")}'`;

const samples = [
  { name: "[Sample] The Smith Family", max: 4, members: ["Anna Smith", "Ben Smith"], code: "TEST-AAAA-0001" },
  { name: "[Sample] Clara Jones", max: 2, members: ["Clara Jones"], code: "TEST-AAAA-0002", rsvp: { attending: 1, attendees: ["Clara Jones", "Daniel Park"], dietary: "Vegetarian" } },
  { name: "[Sample] Grandma Rose", max: 1, members: ["Rose Miller"], code: "TEST-AAAA-0003", rsvp: { attending: 0, attendees: [], dietary: "" } },
];

const statements = ["DELETE FROM households WHERE display_name LIKE '[Sample]%'"];
for (const s of samples) {
  const id = `(SELECT id FROM households WHERE display_name = ${esc(s.name)})`;
  statements.push(`INSERT INTO households (display_name, max_attendees, invite_code_hash) VALUES (${esc(s.name)}, ${s.max}, ${esc(hashCode(s.code))})`);
  s.members.forEach((m, i) => statements.push(`INSERT INTO household_members (household_id, position, full_name) VALUES (${id}, ${i}, ${esc(m)})`));
  if (s.rsvp) {
    statements.push(
      `INSERT INTO rsvps (household_id, attending, attendee_count, dietary, revision, responded_by) VALUES (${id}, ${s.rsvp.attending}, ${s.rsvp.attendees.length}, ${esc(s.rsvp.dietary)}, 'seed${samples.indexOf(s)}', 'guest')`,
    );
    s.rsvp.attendees.forEach((a, i) => statements.push(`INSERT INTO rsvp_attendees (household_id, position, full_name) VALUES (${id}, ${i}, ${esc(a)})`));
  }
}

execFileSync(process.execPath, [WRANGLER, "d1", "execute", "wedding-db", "--local", "--command", statements.join("; ")], {
  cwd: ROOT,
  stdio: ["ignore", "ignore", "inherit"],
});

console.log("Seeded the local database with sample households. Try these invitation links (with `pnpm preview`):\n");
for (const s of samples) console.log(`  ${s.name.padEnd(28)} http://localhost:8788/rsvp#code=${s.code}`);
console.log("");
