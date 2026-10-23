import { describe, expect, it } from "vitest";
import { generateInviteCode, hashPassword, normalizeInviteCode, verifyPassword } from "../server/crypto";
import { csvCell } from "../server/csv";
import { wedding } from "../shared/wedding";

describe("invitation codes", () => {
  it("generates readable 60-bit codes that round-trip through normalisation", () => {
    const codes = new Set(Array.from({ length: 500 }, generateInviteCode));
    expect(codes.size).toBe(500);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(normalizeInviteCode(code)).toBe(code.replace(/-/g, ""));
    }
  });

  it("forgives common typing differences", () => {
    expect(normalizeInviteCode("abcd efgh jkmn")).toBe("ABCDEFGHJKMN");
    expect(normalizeInviteCode("O0IL-1111-2222")).toBe("001111112222");
    expect(normalizeInviteCode("ABCD-EFGH-JKM")).toBeNull();
    expect(normalizeInviteCode("ABCD-EFGH-JKMU")).toBeNull();
  });
});

describe("password hashing", () => {
  it("verifies the right password only", async () => {
    const hash = await hashPassword("a long passphrase", 1000);
    expect(hash).toMatch(/^pbkdf2-sha256\$1000\$/);
    expect(await verifyPassword("a long passphrase", hash)).toBe(true);
    expect(await verifyPassword("a long passphrase ", hash)).toBe(false);
    expect(await verifyPassword("anything", "garbage")).toBe(false);
    expect(await verifyPassword("anything", "pbkdf2-sha256$999999999$AA==$AA==")).toBe(false);
  });
});

describe("CSV cells", () => {
  it.each([
    ["=1+1", `"'=1+1"`],
    ["+1", `"'+1"`],
    ["-1", `"'-1"`],
    ["@SUM(A1)", `"'@SUM(A1)"`],
    ["\tx", `"'\tx"`],
    ['say "hi"', `"say ""hi"""`],
    ["line\nbreak", `"line\nbreak"`],
    [3, `"3"`],
  ])("escapes %j", (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });
});

describe("wedding configuration", () => {
  /** The wall-clock time an instant shows in `timeZone`, as "YYYY-MM-DDTHH:MM". */
  function localTime(iso: string) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: wedding.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(iso))
        .map((p) => [p.type, p.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  }

  it.each([
    ["date", wedding.date],
    ["ceremony.start", wedding.ceremony.start],
    ["reception.start", wedding.reception.start],
    ["rsvp.deadline", wedding.rsvp.deadline],
  ])("%s uses the correct UTC offset for the wedding time zone", (_name, iso) => {
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?[+-]\d{2}:\d{2}$/);
    expect(localTime(iso)).toBe(iso.slice(0, 16));
  });

  it("closes RSVPs before the wedding", () => {
    expect(Date.parse(wedding.rsvp.deadline)).toBeLessThan(Date.parse(wedding.date));
  });
});
