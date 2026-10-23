import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, inject } from "vitest";
import { getPlatformProxy } from "wrangler";
import { hashPassword } from "../server/crypto";
import type { Env } from "../server/env";
import { handleApiRequest } from "../server/router";

export const ORIGIN = "https://wedding.test";

/** Gives each test file a D1 binding backed by the migrated test database, emptied before every test. */
export function useTestDb() {
  const state = {} as { env: Env; dispose: () => Promise<void> };

  beforeAll(async () => {
    const proxy = await getPlatformProxy<Env>({
      configPath: "wrangler.toml",
      persist: { path: join(inject("persistDir"), "v3") },
    });
    state.env = proxy.env;
    state.dispose = proxy.dispose;
  });

  afterAll(() => state.dispose?.());

  beforeEach(async () => {
    const db = state.env.DB;
    await db.batch(
      ["rsvp_attendees", "rsvps", "household_members", "guest_sessions", "households", "admin_sessions", "admins", "rate_limits"].map(
        (table) => db.prepare(`DELETE FROM ${table}`),
      ),
    );
  });

  return state;
}

export interface CallOptions {
  body?: unknown;
  cookie?: string | null;
  headers?: Record<string, string>;
  ip?: string;
}

export async function call(env: Env, method: string, path: string, options: CallOptions = {}) {
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (options.cookie) headers.set("Cookie", options.cookie);
  headers.set("CF-Connecting-IP", options.ip ?? "203.0.113.10");

  const response = await handleApiRequest(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : typeof options.body === "string" ? options.body : JSON.stringify(options.body),
    }),
    env,
  );
  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: response.status, headers: response.headers, data: data as any, text };
}

/** Converts a Set-Cookie header into a Cookie request header. */
export function cookieFrom(headers: Headers): string {
  const setCookie = headers.get("Set-Cookie");
  if (!setCookie) throw new Error("No Set-Cookie header");
  return setCookie.split(";")[0]!;
}

export async function createAdmin(env: Env, username = "couple", password = "correct horse battery staple") {
  await env.DB.prepare("INSERT INTO admins (username, password_hash) VALUES (?1, ?2)")
    .bind(username, await hashPassword(password, 1000))
    .run();
  return { username, password };
}

export async function adminCookie(env: Env) {
  const credentials = await createAdmin(env);
  const res = await call(env, "POST", "/api/admin/login", { body: credentials });
  if (res.status !== 200) throw new Error(`Admin login failed: ${res.status}`);
  return cookieFrom(res.headers);
}

export async function createHousehold(
  env: Env,
  admin: string,
  input: { displayName?: string; maxAttendees?: number; members?: string[]; notes?: string } = {},
) {
  const res = await call(env, "POST", "/api/admin/households", {
    cookie: admin,
    body: { displayName: "The Smith Family", maxAttendees: 2, members: [], notes: "", ...input },
  });
  if (res.status !== 201) throw new Error(`Create household failed: ${res.status} ${res.text}`);
  return res.data as { household: { id: number }; inviteCode: string };
}

export async function guestCookie(env: Env, code: string) {
  const res = await call(env, "POST", "/api/invitation/session", { body: { code } });
  if (res.status !== 200) throw new Error(`Guest session failed: ${res.status}`);
  return cookieFrom(res.headers);
}
