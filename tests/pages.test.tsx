import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { wedding } from "../shared/wedding";
import { getCountdown } from "../src/lib/countdown";
import HomePage from "../src/pages/HomePage";

describe("public invitation page", () => {
  const html = renderToString(<HomePage />);

  it("renders the wedding details from the central configuration", () => {
    for (const text of [wedding.couple.partnerOne, wedding.couple.partnerTwo, wedding.ceremony.name, wedding.reception.name, wedding.dressCode.title]) {
      expect(html).toContain(text.replace(/'/g, "&#x27;"));
    }
    for (const item of wedding.schedule) expect(html).toContain(item.title.replace(/&/g, "&amp;"));
    expect(html).toContain("Saturday, June 12, 2027");
    expect(html).toContain("4:00 PM");
  });

  it("links to RSVP and to map directions, but never to the admin area", () => {
    expect(html).toContain('href="/rsvp"');
    expect(html).toContain(`href="${wedding.ceremony.mapUrl.replace(/&/g, "&amp;")}"`);
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("/admin");
  });

  it("contains no guest data or API calls", () => {
    expect(html).not.toMatch(/\/api\//);
  });
});

describe("countdown", () => {
  const target = Date.parse("2027-06-12T16:00:00-04:00");

  it("breaks the remaining time into days, hours, minutes and seconds", () => {
    const now = target - (3 * 86_400 + 4 * 3_600 + 5 * 60 + 6) * 1000;
    expect(getCountdown(target, now)).toEqual({ phase: "upcoming", days: 3, hours: 4, minutes: 5, seconds: 6 });
  });

  it("is independent of the viewer's time zone (uses absolute instants)", () => {
    expect(getCountdown(target, Date.parse("2027-06-12T19:59:59Z"))).toMatchObject({ phase: "upcoming", seconds: 1 });
  });

  it("handles the wedding day and the date passing", () => {
    expect(getCountdown(target, target)).toEqual({ phase: "today" });
    expect(getCountdown(target, target + 11 * 3_600_000)).toEqual({ phase: "today" });
    expect(getCountdown(target, target + 13 * 3_600_000)).toEqual({ phase: "past" });
  });
});
