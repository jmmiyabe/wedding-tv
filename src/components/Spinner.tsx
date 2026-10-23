export function Spinner({ label, small = false }: { label: string; small?: boolean }) {
  return (
    <span role="status" className="inline-flex items-center gap-3">
      <span
        aria-hidden="true"
        className={`${small ? "size-4 border-current/30 border-t-current" : "size-8 border-border border-t-accent"} animate-spin rounded-full border-2 motion-reduce:animate-none`}
      />
      <span className={small ? "" : "text-sm text-muted"}>{label}</span>
    </span>
  );
}
