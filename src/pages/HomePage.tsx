import { PageShell } from "../components/PageShell";

export default function HomePage() {
  return (
    <PageShell>
      <p className="text-xs font-medium uppercase tracking-[0.3em] text-accent">Save the date</p>
      <h1 className="mt-6 text-balance font-serif text-4xl leading-tight sm:text-5xl">
        Wedding Invitation
      </h1>
      <div aria-hidden="true" className="mx-auto my-8 h-px w-16 bg-accent" />
      <p className="text-pretty leading-relaxed text-muted">
        Our invitation and RSVP details will be shared here soon.
      </p>
    </PageShell>
  );
}
