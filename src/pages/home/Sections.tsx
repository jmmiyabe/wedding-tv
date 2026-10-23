import type { ReactNode } from "react";
import { coupleNames, wedding, type Venue } from "../../../shared/wedding";
import { EucalyptusSprig, FloralDivider, OliveSprig } from "../../components/Botanical";
import { Reveal } from "../../components/Reveal";
import { formatDate, formatDotDate, formatLongDate, formatTimeWithZone } from "../../lib/format";
import { Link } from "../../lib/router";

function SectionHeading({ eyebrow, title, id }: { eyebrow: string; title: string; id: string }) {
  return (
    <div className="text-center">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id} className="mt-3 font-serif text-4xl font-light text-balance text-foreground sm:text-5xl">
        {title}
      </h2>
      <FloralDivider className="mt-5" />
    </div>
  );
}

function Section({ id, eyebrow, title, children, className = "" }: { id: string; eyebrow: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`px-6 py-20 sm:px-10 sm:py-28 ${className}`}>
      <Reveal className="mx-auto max-w-5xl">
        <SectionHeading eyebrow={eyebrow} title={title} id={`${id}-title`} />
        <div className="mt-12 sm:mt-16">{children}</div>
      </Reveal>
    </section>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VenueCard({ label, venue }: { label: string; venue: Venue }) {
  return (
    <article className="card relative overflow-hidden p-8 text-center sm:p-10">
      <EucalyptusSprig className="pointer-events-none absolute -top-4 -right-6 w-20 rotate-[200deg] text-sage/40" />
      <p className="eyebrow">{label}</p>
      <h3 className="mt-4 font-serif text-3xl text-foreground">{venue.name}</h3>
      <p className="mt-4 text-foreground">
        <time dateTime={venue.start}>{formatLongDate(venue.start)}</time>
        <br />
        <span className="text-muted">{formatTimeWithZone(venue.start)}</span>
      </p>
      <address className="mt-4 text-sm leading-relaxed text-muted not-italic">{venue.address}</address>
      {venue.note && <p className="mt-3 font-serif text-lg text-muted italic">{venue.note}</p>}
      <a
        href={venue.mapUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex items-center gap-2 border-b border-accent/50 pb-0.5 text-sm font-medium tracking-wide text-sage-dark transition-colors hover:border-sage-dark"
      >
        Get directions <ArrowIcon />
        <span className="sr-only">to {venue.name} (opens in a new tab)</span>
      </a>
    </article>
  );
}

export function Details() {
  return (
    <Section id="details" eyebrow="Where & when" title="The Celebration">
      <div className="grid gap-6 md:grid-cols-2 md:gap-8">
        <VenueCard label="The ceremony" venue={wedding.ceremony} />
        <VenueCard label="The reception" venue={wedding.reception} />
      </div>
    </Section>
  );
}

export function Schedule() {
  return (
    <Section id="schedule" eyebrow="The day" title="Order of the Day" className="bg-cream/50">
      <ol className="mx-auto max-w-xl">
        {wedding.schedule.map((item, index) => (
          <li key={item.title} className="grid grid-cols-[5.5rem_1.5rem_1fr] gap-x-3 sm:grid-cols-[7rem_2rem_1fr]">
            <p className="pt-0.5 text-right font-serif text-lg text-accent italic sm:text-xl">{item.time}</p>
            <div aria-hidden="true" className="flex flex-col items-center">
              <span className="mt-2.5 size-2.5 rotate-45 border border-accent bg-background" />
              {index < wedding.schedule.length - 1 && <span className="w-px flex-1 bg-accent/30" />}
            </div>
            <div className="pb-9">
              <p className="font-serif text-2xl text-foreground">{item.title}</p>
              {"description" in item && item.description && <p className="mt-1 text-sm leading-relaxed text-muted">{item.description}</p>}
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function GuestGuide() {
  return (
    <Section id="guide" eyebrow="Good to know" title="Guest Guide">
      <div className="grid gap-6 md:grid-cols-[0.9fr_1.1fr] md:gap-8">
        <article className="card relative flex flex-col justify-center overflow-hidden bg-sage-soft/50 p-8 text-center sm:p-10">
          <OliveSprig className="pointer-events-none absolute -bottom-6 -left-8 w-40 text-sage/40" />
          <p className="eyebrow">Dress code</p>
          <h3 className="mt-4 font-serif text-3xl text-foreground">{wedding.dressCode.title}</h3>
          <p className="mt-4 leading-relaxed text-pretty text-muted">{wedding.dressCode.description}</p>
        </article>
        <article className="card p-8 sm:p-10">
          <h3 className="font-serif text-2xl text-foreground">A few kind reminders</h3>
          <ul className="mt-6 space-y-4">
            {wedding.reminders.map((reminder) => (
              <li key={reminder} className="flex gap-4 leading-relaxed text-muted">
                <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rotate-45 bg-accent" />
                <span>{reminder}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </Section>
  );
}

export function Story() {
  if (wedding.story.length === 0) return null;
  return (
    <Section id="story" eyebrow="How it began" title="Our Story" className="bg-cream/50">
      <ol className="grid gap-10 md:grid-cols-3 md:gap-8">
        {wedding.story.map((moment) => (
          <li key={moment.title} className="text-center">
            <p className="font-serif text-5xl font-light text-accent/80">{moment.date}</p>
            <h3 className="mt-3 font-serif text-2xl text-foreground">{moment.title}</h3>
            <p className="mx-auto mt-3 max-w-xs leading-relaxed text-pretty text-muted">{moment.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function Gallery() {
  if (wedding.gallery.length === 0) return null;
  return (
    <Section id="gallery" eyebrow="Moments" title="Gallery">
      <ul className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3">
        {wedding.gallery.map((photo, index) => (
          <li key={photo.src} className={index === 0 ? "col-span-2 md:col-span-1" : ""}>
            <img
              src={photo.src}
              alt={photo.alt}
              width={photo.width}
              height={photo.height}
              loading="lazy"
              decoding="async"
              className="aspect-[4/5] size-full rounded-2xl bg-cream object-cover"
            />
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function RsvpCallout({ now }: { now: number }) {
  const closed = now > Date.parse(wedding.rsvp.deadline) && !wedding.rsvp.allowLateResponses;
  return (
    <section id="rsvp" aria-labelledby="rsvp-title" className="relative isolate overflow-hidden bg-sage-dark px-6 py-24 text-center text-background sm:py-32">
      <EucalyptusSprig className="pointer-events-none absolute -bottom-10 -left-10 -z-10 w-48 text-background/15 sm:w-64" />
      <EucalyptusSprig className="pointer-events-none absolute -top-10 -right-8 -z-10 w-40 rotate-180 text-background/15 sm:w-56" />
      <Reveal className="mx-auto max-w-xl">
        <p className="text-[0.7rem] font-medium tracking-[0.32em] text-accent-soft uppercase">Kindly reply</p>
        <h2 id="rsvp-title" className="mt-4 font-serif text-5xl font-light sm:text-6xl">
          Will you join us?
        </h2>
        {closed ? (
          <p className="mt-6 leading-relaxed text-background/85">
            Our RSVP list closed on {formatDate(wedding.rsvp.deadline)}. If your plans have changed, please get in touch with us directly.
          </p>
        ) : (
          <>
            <p className="mt-6 leading-relaxed text-pretty text-background/85">
              Please let us know by <strong className="font-semibold text-background">{formatDate(wedding.rsvp.deadline)}</strong>. You'll
              need the invitation code from your invitation, or simply open your personal invitation link.
            </p>
            <Link
              href="/rsvp"
              className="btn mt-9 bg-background text-foreground hover:bg-cream focus-visible:outline-background"
            >
              Reply to your invitation
            </Link>
          </>
        )}
      </Reveal>
    </section>
  );
}

export function Contact() {
  const { contact } = wedding;
  return (
    <Section id="contact" eyebrow="Questions" title="Get in Touch">
      <div className="text-center">
        <p className="mx-auto max-w-md leading-relaxed text-muted">{contact.intro}</p>
        <ul className="mt-8 flex flex-wrap justify-center gap-6">
          {contact.people.map((person) => (
            <li key={person.name} className="card min-w-60 px-8 py-6">
              <p className="font-serif text-2xl text-foreground">{person.name}</p>
              {person.email && (
                <a href={`mailto:${person.email}`} className="mt-2 block text-sm text-sage-dark underline decoration-accent/50 underline-offset-4 hover:decoration-sage-dark">
                  {person.email}
                </a>
              )}
              {person.phone && (
                <a href={`tel:${person.phone.replace(/[^\d+]/g, "")}`} className="mt-1 block text-sm text-sage-dark underline decoration-accent/50 underline-offset-4">
                  {person.phone}
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-border/70 bg-cream/60 px-6 py-14 text-center">
      <EucalyptusSprig className="mx-auto w-10 text-sage" />
      <p className="mt-4 font-serif text-3xl text-foreground">{coupleNames()}</p>
      <p className="mt-2 text-sm tracking-[0.3em] text-muted">{formatDotDate(wedding.date)}</p>
      <p className="mt-6 text-xs text-muted/80">With love and gratitude.</p>
    </footer>
  );
}
