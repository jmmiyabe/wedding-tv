#!/usr/bin/env node
/**
 * Administrator account management. There is deliberately no web registration:
 * whoever can run this against the D1 database (i.e. has access to the Cloudflare
 * account) controls who can sign in.
 *
 *   pnpm admin create <username> --local|--remote [--password-stdin]
 *   pnpm admin reset-password <username> --local|--remote [--password-stdin]
 *   pnpm admin delete <username> --local|--remote
 *   pnpm admin sign-out-all --local|--remote
 *   pnpm admin list --local|--remote
 *
 * Without --password-stdin a strong password is generated and printed once.
 * Passwords are hashed here (PBKDF2-SHA256, same format as server/crypto.ts);
 * only the hash is sent to the database.
 */
import { execFileSync } from "node:child_process";
import { pbkdf2Sync, randomBytes, randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ITERATIONS = 50_000; // Keep in sync with PASSWORD_ITERATIONS in server/crypto.ts (max 100,000 on Workers).
const MIN_PASSWORD_LENGTH = 12;
const DATABASE = "wedding-db";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER = join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js");

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const [command, username] = args.filter((a) => !a.startsWith("--"));

const target = flags.has("--remote") ? "--remote" : flags.has("--local") ? "--local" : null;
if (!command) fail("Missing command. See scripts/admin.mjs for usage.");
if (!target) fail("Pass --local (development database) or --remote (production database).");
if (flags.has("--local") && flags.has("--remote")) fail("Pass only one of --local or --remote.");

function requireUsername() {
  // Strict allowlist: the value is embedded in SQL for the wrangler CLI, which has no bound parameters.
  if (!username || !/^[a-z0-9._-]{3,32}$/.test(username)) {
    fail("Username must be 3–32 characters: lowercase letters, digits, '.', '_' or '-'.");
  }
  return username;
}

function sql(statements) {
  const output = execFileSync(process.execPath, [WRANGLER, "d1", "execute", DATABASE, target, "--json", "--yes", "--command", statements.join("; ")], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  return JSON.parse(output.slice(output.indexOf("[")));
}

function generatePassword() {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const groups = Array.from({ length: 6 }, () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join(""));
  return groups.join("-");
}

async function readPassword() {
  if (!flags.has("--password-stdin")) return { password: generatePassword(), generated: true };
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const password = input.replace(/\r?\n$/, "");
  if (password.length < MIN_PASSWORD_LENGTH) fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (password.length > 256) fail("Password must be 256 characters or fewer.");
  return { password, generated: false };
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
  return `pbkdf2-sha256$${ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function announce(password, generated) {
  if (!generated) return;
  console.log("\nPassword (shown once — store it in a password manager):\n");
  console.log(`  ${password}\n`);
}

const now = new Date().toISOString();

switch (command) {
  case "create": {
    const name = requireUsername();
    const { password, generated } = await readPassword();
    const existing = sql([`SELECT id FROM admins WHERE username = '${name}'`])[0].results;
    if (existing.length > 0) fail(`Administrator "${name}" already exists. Use reset-password instead.`);
    sql([`INSERT INTO admins (username, password_hash) VALUES ('${name}', '${hashPassword(password)}')`]);
    console.log(`Created administrator "${name}" (${target.slice(2)} database).`);
    announce(password, generated);
    break;
  }
  case "reset-password": {
    const name = requireUsername();
    const { password, generated } = await readPassword();
    const [update] = sql([
      `UPDATE admins SET password_hash = '${hashPassword(password)}', password_changed_at = '${now}', failed_logins = 0, locked_until = NULL WHERE username = '${name}' RETURNING id`,
      `DELETE FROM admin_sessions WHERE admin_id IN (SELECT id FROM admins WHERE username = '${name}')`,
    ]);
    if (update.results.length === 0) fail(`No administrator named "${name}".`);
    console.log(`Password reset for "${name}". Their existing sessions were signed out; the lockout was cleared.`);
    announce(password, generated);
    break;
  }
  case "delete": {
    const name = requireUsername();
    const [removed] = sql([`DELETE FROM admins WHERE username = '${name}' RETURNING id`]);
    if (removed.results.length === 0) fail(`No administrator named "${name}".`);
    console.log(`Deleted administrator "${name}" and their sessions.`);
    break;
  }
  case "sign-out-all": {
    sql(["DELETE FROM admin_sessions"]);
    console.log("All administrator sessions were signed out.");
    break;
  }
  case "list": {
    const [rows] = sql(["SELECT username, created_at, password_changed_at, locked_until FROM admins ORDER BY username"]);
    if (rows.results.length === 0) console.log("No administrators yet. Create one with: pnpm admin create <username> " + target);
    else console.table(rows.results);
    break;
  }
  default:
    fail(`Unknown command "${command}".`);
}
