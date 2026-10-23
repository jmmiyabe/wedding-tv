#!/usr/bin/env node
/**
 * Read-only smoke test against a running site — local preview or production.
 *
 *   pnpm test:smoke                                   # http://localhost:8788
 *   pnpm test:smoke https://<project>.pages.dev
 *
 * It never logs in and never writes data (one deliberately invalid invitation
 * code is tried, which counts towards that IP's rate limit).
 */
const base = (process.argv[2] ?? "http://localhost:8788").replace(/\/+$/, "");
let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures++;
    console.log(`  ✗ ${name}\n      ${error.message}`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function get(path, init) {
  return fetch(`${base}${path}`, { redirect: "manual", ...init });
}

console.log(`Smoke testing ${base}\n`);

await check("public invitation page loads with security headers", async () => {
  const res = await get("/");
  expect(res.status === 200, `status ${res.status}`);
  expect((await res.text()).includes('<div id="root">'), "missing app root");
  const csp = res.headers.get("content-security-policy") ?? "";
  expect(csp.includes("default-src 'self'"), "missing Content-Security-Policy");
  expect(res.headers.get("x-frame-options") === "DENY", "missing X-Frame-Options");
});

await check("client-side routes are served by the SPA", async () => {
  for (const path of ["/rsvp", "/admin"]) {
    const res = await get(path);
    expect(res.status === 200, `${path} → ${res.status}`);
  }
});

await check("health check reports a migrated database", async () => {
  const res = await get("/api/health");
  const body = await res.json();
  expect(res.status === 200 && body.status === "ok", `status ${res.status} ${JSON.stringify(body)}`);
  expect(body.schemaVersion >= 3, `schemaVersion ${body.schemaVersion} — run the migrations`);
});

await check("guest data requires an invitation session", async () => {
  expect((await get("/api/invitation")).status === 401, "GET /api/invitation was not 401");
});

await check("an invalid invitation code is rejected", async () => {
  const res = await get("/api/invitation/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "0000-0000-0000" }),
  });
  expect([401, 429].includes(res.status), `status ${res.status}`);
  expect(!res.headers.get("set-cookie"), "a cookie was set");
});

await check("admin data and CSV export require authentication", async () => {
  for (const path of ["/api/admin/session", "/api/admin/stats", "/api/admin/households", "/api/admin/export.csv"]) {
    const res = await get(path);
    expect(res.status === 401, `${path} → ${res.status}`);
  }
});

await check("unknown API routes return JSON 404", async () => {
  const res = await get("/api/does-not-exist");
  expect(res.status === 404 && (res.headers.get("content-type") ?? "").includes("application/json"), `status ${res.status}`);
});

console.log(failures === 0 ? "\nAll smoke checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
