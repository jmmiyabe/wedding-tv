import { useState, type CSSProperties } from "react";
import { wedding } from "../../../shared/wedding";
import { EucalyptusSprig, FloralDivider } from "../../components/Botanical";
import { formatDate, formatLongDate, formatTime } from "../../lib/format";
import { Link } from "../../lib/router";

const NAV = [
  { href: "#details", label: "Details" },
  { href: "#schedule", label: "Schedule" },
  { href: "#guide", label: "Guest guide" },
  ...(wedding.story.length > 0 ? [{ href: "#story", label: "Our story" }] : []),
];

function rise(delayMs: number): CSSProperties {
  return { animationDelay: `${delayMs}ms` };
}

export function Hero() {
  const { couple, hero } = wedding;
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <header className="relative isolate overflow-hidden">
      {/* Soft background washes */}
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-32 size-[34rem] rounded-full bg-sage-soft/70 blur-3xl" />
        <div className="absolute top-1/3 -right-40 size-[30rem] rounded-full bg-accent-soft/40 blur-3xl" />
      </div>

      <nav aria-label="Invitation sections" className="mx-auto flex max-w-6xl items-center justify-between px-6 pt-6 sm:px-10">
        <a href="#top" className="font-serif text-2xl tracking-wide text-foreground">
          {couple.partnerOne[0]}
          <span className="mx-1 text-accent italic">&amp;</span>
          {couple.partnerTwo[0]}
        </a>
        <div className="flex items-center gap-7">
          <ul className="hidden items-center gap-7 text-sm text-muted md:flex">
            {NAV.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="transition-colors hover:text-foreground">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <Link href="/rsvp" className="btn-outline min-h-10 px-5 text-xs tracking-[0.18em] uppercase">
            RSVP
          </Link>
        </div>
      </nav>

      <div
        id="top"
        className="mx-auto grid max-w-6xl items-center gap-12 px-6 pt-10 pb-20 sm:px-10 lg:min-h-[calc(100dvh-5rem)] lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pt-8"
      >
        <div className="order-2 text-center lg:order-1 lg:text-left">
          <p className="eyebrow animate-rise motion-reduce:animate-none" style={rise(100)}>
            {hero.eyebrow}
          </p>
          <h1
            className="mt-6 font-serif text-[clamp(3.5rem,13vw,7.25rem)] leading-[0.92] font-light text-balance text-foreground animate-rise motion-reduce:animate-none"
            style={rise(250)}
          >
            <span className="block">{couple.partnerOne}</span>
            <span className="my-1 block font-normal text-accent italic lg:ml-[0.6em]">&amp;</span>
            <span className="block lg:ml-[1.1em]">{couple.partnerTwo}</span>
          </h1>

          <FloralDivider className="mt-8 animate-rise motion-reduce:animate-none lg:justify-start" />

          <div className="mt-6 animate-rise motion-reduce:animate-none" style={rise(450)}>
            <p className="font-serif text-2xl text-foreground">
              <time dateTime={wedding.date}>{formatLongDate(wedding.date)}</time>
            </p>
            <p className="mt-1 text-sm tracking-[0.2em] text-muted uppercase">
              {formatTime(wedding.date)} · {wedding.ceremony.name}
            </p>
          </div>

          <p
            className="mx-auto mt-7 max-w-md font-serif text-xl leading-relaxed text-pretty text-muted italic animate-rise motion-reduce:animate-none lg:mx-0"
            style={rise(600)}
          >
            {hero.message}
          </p>

          <div
            className="mt-9 flex flex-col items-center gap-3 animate-rise motion-reduce:animate-none sm:flex-row sm:justify-center lg:justify-start"
            style={rise(750)}
          >
            <Link href="/rsvp" className="btn-primary w-full sm:w-auto">
              RSVP to our wedding
            </Link>
            <a href="#details" className="btn-outline w-full sm:w-auto">
              View the details
            </a>
          </div>
          <p className="mt-4 text-sm text-muted animate-rise motion-reduce:animate-none" style={rise(850)}>
            Kindly reply by <time dateTime={wedding.rsvp.deadline}>{formatDate(wedding.rsvp.deadline)}</time>
          </p>
        </div>

        <div className="relative order-1 mx-auto w-full max-w-[15rem] animate-rise motion-reduce:animate-none sm:max-w-sm lg:order-2 lg:max-w-md" style={rise(0)}>
          <div aria-hidden="true" className="absolute inset-0 translate-x-3 translate-y-3 rounded-t-full border border-accent/50" />
          <div className="relative aspect-[4/5] overflow-hidden rounded-t-full bg-gradient-to-b from-sage-soft via-cream to-accent-soft/60 shadow-[0_30px_60px_-30px_rgb(47_62_54/0.35)]">
            {!imageFailed && (
              <img
                src={hero.image.src}
                alt={hero.image.alt}
                width={hero.image.width}
                height={hero.image.height}
                fetchPriority="high"
                decoding="async"
                onError={() => setImageFailed(true)}
                className="size-full object-cover"
              />
            )}
          </div>
          <EucalyptusSprig className="absolute -bottom-8 -left-12 w-28 rotate-[-12deg] text-sage sm:w-32" />
          <EucalyptusSprig className="absolute -top-6 -right-10 w-24 rotate-[160deg] text-sage/80 sm:w-28" />
        </div>
      </div>
    </header>
  );
}
