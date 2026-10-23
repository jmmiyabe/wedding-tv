export type CountdownState =
  | { phase: "upcoming"; days: number; hours: number; minutes: number; seconds: number }
  | { phase: "today" }
  | { phase: "past" };

/** How long a celebration counts as "today" after the ceremony starts. */
const CELEBRATION_MS = 12 * 60 * 60 * 1000;

/** Pure countdown calculation, based on absolute instants (time-zone independent). */
export function getCountdown(targetMs: number, nowMs: number): CountdownState {
  const remaining = targetMs - nowMs;
  if (remaining <= 0) return -remaining < CELEBRATION_MS ? { phase: "today" } : { phase: "past" };

  const totalSeconds = Math.floor(remaining / 1000);
  return {
    phase: "upcoming",
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}
