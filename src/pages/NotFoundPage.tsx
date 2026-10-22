import { PageShell } from "../components/PageShell";

export default function NotFoundPage() {
  return (
    <PageShell>
      <p className="text-xs font-medium uppercase tracking-[0.3em] text-accent">404</p>
      <h1 className="mt-6 font-serif text-3xl sm:text-4xl">Page not found</h1>
      <p className="mt-4 text-pretty text-muted">
        {"The page you're looking for doesn't exist. Please check your invitation link."}
      </p>
      <a
        href="/"
        className="mt-8 inline-block rounded-full border border-foreground px-6 py-2.5 text-sm font-medium transition-colors hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Back to home
      </a>
    </PageShell>
  );
}
