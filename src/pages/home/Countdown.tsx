import { useEffect, useState } from "react";
import { coupleNames, wedding } from "../../../shared/wedding";
import { getCountdown } from "../../lib/countdown";
import { formatDotDate } from "../../lib/format";

const TARGET = Date.parse(wedding.date);

export function Countdown() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const state = getCountdown(TARGET, now);

  return (
    <section aria-labelledby="countdown-title" className="border-y border-border/70 bg-cream/60 px-6 py-16 text-center sm:py-20">
      <p className="eyebrow">{state.phase === "upcoming" ? "Counting down to" : "Our wedding day"}</p>
      <h2 id="countdown-title" className="mt-3 font-serif text-3xl text-foreground sm:text-4xl">
        {formatDotDate(wedding.date)}
      </h2>

      {state.phase === "upcoming" && (
        <>
          <p className="sr-only">
            {state.days} days until the wedding of {coupleNames("and")}.
          </p>
          <dl aria-hidden="true" className="mx-auto mt-10 grid max-w-2xl grid-cols-4 gap-2 sm:gap-6">
            {(
              [
                ["Days", state.days],
                ["Hours", state.hours],
                ["Minutes", state.minutes],
                ["Seconds", state.seconds],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex flex-col-reverse items-center gap-2">
                <dt className="text-[0.65rem] tracking-[0.28em] text-muted uppercase sm:text-xs">{label}</dt>
                <dd className="font-serif text-4xl font-light text-foreground lining-nums tabular-nums sm:text-6xl">
                  {String(value).padStart(2, "0")}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {state.phase === "today" && (
        <p className="mx-auto mt-6 max-w-md font-serif text-2xl text-muted italic">Today is the day — we can't wait to celebrate with you.</p>
      )}
      {state.phase === "past" && (
        <p className="mx-auto mt-6 max-w-md font-serif text-2xl text-muted italic">
          We said “I do”! Thank you for being part of our story.
        </p>
      )}
    </section>
  );
}
