import { wedding } from "../../shared/wedding";

// Every date shown on the site is rendered in the wedding's time zone, so guests
// travelling from elsewhere see the local time of the venue.

function format(iso: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-US", { timeZone: wedding.timeZone, ...options }).format(new Date(iso));
}

/** "Saturday, June 12, 2027" */
export function formatLongDate(iso: string) {
  return format(iso, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

/** "June 12, 2027" */
export function formatDate(iso: string) {
  return format(iso, { year: "numeric", month: "long", day: "numeric" });
}

/** "4:00 PM" */
export function formatTime(iso: string) {
  return format(iso, { hour: "numeric", minute: "2-digit" });
}

/** "4:00 PM EDT" */
export function formatTimeWithZone(iso: string) {
  return format(iso, { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

/** "06 · 12 · 2027" */
export function formatDotDate(iso: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: wedding.timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.month} · ${parts.day} · ${parts.year}`;
}

/** Short timestamp in the viewer's own time zone, for admin "last updated" columns. */
export function formatTimestamp(iso: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
