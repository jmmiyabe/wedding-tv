import { PageShell } from "./PageShell";

export function LoadingScreen() {
  return (
    <PageShell>
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-4">
        <span
          aria-hidden="true"
          className="size-8 animate-spin rounded-full border-2 border-border border-t-accent motion-reduce:animate-none"
        />
        <span className="text-sm text-muted">Loading…</span>
      </div>
    </PageShell>
  );
}
