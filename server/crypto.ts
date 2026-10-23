const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 256-bit random token, URL-safe base64. Used for session identifiers. */
export function randomToken(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

// ─── Invitation codes ───────────────────────────────────────────────────────────
// 12 Crockford base32 characters = 60 bits of randomness, formatted XXXX-XXXX-XXXX.
// Easy to read aloud or type from a printed card; with rate limiting, guessing is
// infeasible. Only the SHA-256 of the normalized code is stored.

const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 12;

export function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  // 256 is a multiple of 32, so `& 31` is unbiased.
  const chars = [...bytes].map((b) => CODE_ALPHABET[b & 31]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

/** Returns the canonical form of a typed code, or null if it cannot be valid. */
export function normalizeInviteCode(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(cleaned) ? cleaned : null;
}

export function hashInviteCode(normalized: string): Promise<string> {
  return sha256Hex(`invite:${normalized}`);
}

// ─── Passwords ──────────────────────────────────────────────────────────────────
// PBKDF2-HMAC-SHA256 via Web Crypto (the only password KDF available natively in
// Workers). Workers cap PBKDF2 at 100,000 iterations, and the free plan allows
// ~10 ms CPU per request, so the default leaves headroom. The iteration count is
// stored in each hash and can be raised later without a migration.
// `scripts/admin.mjs` produces the same format with Node's crypto.

export const PASSWORD_ITERATIONS = 50_000;
const MAX_ITERATIONS = 100_000;

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = PASSWORD_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterationsText, saltText, hashText] = stored.split("$");
  const iterations = Number(iterationsText);
  if (scheme !== "pbkdf2-sha256" || !saltText || !hashText) return false;
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) return false;

  const actual = await pbkdf2(password, fromBase64(saltText), iterations);
  return constantTimeEqual(actual, fromBase64(hashText));
}

/** Verified against when a username does not exist, so response timing is similar. */
export const DUMMY_PASSWORD_HASH =
  "pbkdf2-sha256$50000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
