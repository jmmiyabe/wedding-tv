/**
 * Central wedding configuration — the single source of truth for everything the
 * public invitation shows, and for the RSVP rules the server enforces.
 *
 * This file is bundled into the public website, so it must only contain
 * information you are happy for anyone with the link to read. Never put guest
 * names, invitation codes, or secrets here.
 *
 * Times: every `start`/`deadline` is an ISO 8601 timestamp WITH the UTC offset that
 * applies in `timeZone` on that date (watch daylight saving time). `pnpm test`
 * checks that each offset matches the time zone.
 */

export interface Venue {
  name: string;
  address: string;
  /** Opens in the guest's maps app. Any maps URL works. */
  mapUrl: string;
  start: string;
  note?: string;
}

export interface ScheduleItem {
  time: string;
  title: string;
  description?: string;
}

export interface Photo {
  /** Path under `public/` (e.g. `/images/gallery-1.jpg`). Keep images under ~300 KB. */
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface StoryMoment {
  date: string;
  title: string;
  text: string;
}

function mapsSearch(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// ─── Placeholder content: replace with your real details ────────────────────────
export const wedding = {
  couple: {
    partnerOne: "Olivia",
    partnerTwo: "Samuel",
  },

  /** IANA time zone of the wedding. Countdown and all displayed times use it. */
  timeZone: "America/New_York",

  /** Start of the ceremony. The countdown counts down to this moment. */
  date: "2027-06-12T16:00:00-04:00",

  hero: {
    eyebrow: "Together with their families",
    message:
      "We joyfully invite you to celebrate our marriage — an afternoon of vows, good food, and dancing beneath the summer sky.",
    image: {
      src: "/images/cover.svg",
      alt: "Soft watercolour wash with sage and ivory botanical illustrations",
      width: 1200,
      height: 1500,
    } satisfies Photo,
  },

  ceremony: {
    name: "St. Mary's Garden Chapel",
    address: "12 Willow Lane, Rosebrook, NY 12000",
    mapUrl: mapsSearch("12 Willow Lane, Rosebrook, NY 12000"),
    start: "2027-06-12T16:00:00-04:00",
    note: "Please be seated by 3:45 pm.",
  } satisfies Venue,

  reception: {
    name: "The Orchard House",
    address: "48 Meadow Road, Rosebrook, NY 12000",
    mapUrl: mapsSearch("48 Meadow Road, Rosebrook, NY 12000"),
    start: "2027-06-12T17:30:00-04:00",
    note: "A ten-minute drive from the chapel. Free parking on site.",
  } satisfies Venue,

  schedule: [
    { time: "3:30 pm", title: "Guests arrive", description: "Welcome drinks in the chapel garden." },
    { time: "4:00 pm", title: "Ceremony" },
    { time: "5:30 pm", title: "Cocktail hour", description: "Canapés on the orchard lawn." },
    { time: "7:00 pm", title: "Dinner & toasts" },
    { time: "8:30 pm", title: "First dance & dancing" },
    { time: "11:00 pm", title: "Carriages" },
  ] satisfies ScheduleItem[],

  dressCode: {
    title: "Garden formal",
    description:
      "Suits or summer suits; cocktail or floor-length dresses. Soft, light colours are lovely — the reception is on grass, so block heels or flats are kind to your feet.",
  },

  reminders: [
    "Kindly reply by the RSVP date so we can finalise numbers with our caterer.",
    "Your invitation lists the number of seats reserved in your honour.",
    "We love your little ones, but our celebration is adults-only (except for children in the wedding party).",
    "The ceremony is unplugged — please keep phones away until the reception.",
    "Evenings can be cool in the orchard; a light layer is a good idea.",
  ],

  /** Set to `[]` to hide the "Our story" section. */
  story: [
    {
      date: "2019",
      title: "How we met",
      text: "A rainy afternoon, one umbrella, and a bookshop that closed just as we reached the door.",
    },
    {
      date: "2023",
      title: "Our first home",
      text: "A tiny apartment, a too-big dining table, and a lot of Sunday dinners with friends.",
    },
    {
      date: "2026",
      title: "The proposal",
      text: "At the same bookshop, in the same rain — this time with a ring tucked into a favourite novel.",
    },
  ] satisfies StoryMoment[],

  /** Set to `[]` to hide the gallery. Replace the placeholders with optimised photos. */
  gallery: [
    { src: "/images/gallery-1.svg", alt: "Placeholder illustration of a garden path", width: 800, height: 1000 },
    { src: "/images/gallery-2.svg", alt: "Placeholder illustration of a bouquet", width: 800, height: 800 },
    { src: "/images/gallery-3.svg", alt: "Placeholder illustration of an orchard", width: 800, height: 1000 },
  ] satisfies Photo[],

  contact: {
    intro: "Questions about the day? We're happy to help.",
    people: [{ name: "Olivia & Samuel", email: "hello@example.com" }] as { name: string; email?: string; phone?: string }[],
  },

  rsvp: {
    /** After this moment guests can no longer submit or change their RSVP (unless `allowLateResponses`). */
    deadline: "2027-05-01T23:59:00-04:00",
    /** When true, guests can still respond after the deadline; the page shows that the date has passed. */
    allowLateResponses: false,
  },
} as const;

export type WeddingConfig = typeof wedding;

export function coupleNames(separator = "&") {
  return `${wedding.couple.partnerOne} ${separator} ${wedding.couple.partnerTwo}`;
}
