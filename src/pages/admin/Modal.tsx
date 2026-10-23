import { useEffect, useRef, useState, type ReactNode } from "react";

/** Native <dialog>: focus trapping, Escape to close and inert background come for free. */
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      onClose={onClose}
      className={`m-auto max-h-[92dvh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-2xl border border-border bg-background p-0 text-foreground shadow-2xl ${wide ? "max-w-2xl" : "max-w-md"}`}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-background/95 px-5 py-4 backdrop-blur sm:px-6">
        <h2 id="modal-title" className="font-serif text-2xl">
          {title}
        </h2>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
        >
          <span aria-hidden="true" className="text-xl leading-none">
            ×
          </span>
          <span className="sr-only">Close</span>
        </button>
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </dialog>
  );
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
}

/** Promise-based confirmation for destructive actions. */
export function useConfirm() {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);

  function confirm(options: ConfirmOptions) {
    return new Promise<boolean>((resolve) => setPending({ ...options, resolve }));
  }

  function finish(ok: boolean) {
    pending?.resolve(ok);
    setPending(null);
  }

  const dialog = pending && (
    <Modal title={pending.title} onClose={() => finish(false)}>
      <p className="leading-relaxed text-muted">{pending.message}</p>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" className="btn-outline" onClick={() => finish(false)} autoFocus>
          Cancel
        </button>
        <button type="button" className={pending.danger ? "btn-danger" : "btn-primary"} onClick={() => finish(true)}>
          {pending.confirmLabel}
        </button>
      </div>
    </Modal>
  );

  return { confirm, dialog };
}
