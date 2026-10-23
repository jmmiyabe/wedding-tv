import { useState } from "react";
import type { InviteCodeResult } from "../../../shared/api";
import { Modal } from "./Modal";

function CopyField({ id, label, value }: { id: string; label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context): select the text for manual copying.
      (document.getElementById(id) as HTMLInputElement | null)?.select();
    }
  }

  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className="flex gap-2">
        <input id={id} readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="field-input font-mono text-sm" />
        <button type="button" onClick={() => void copy()} className="btn-outline min-h-0 shrink-0 px-4">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/** Shows a freshly issued invitation code. Only its hash is stored, so this is the only chance to copy it. */
export function CodeDialog({ result, onClose }: { result: InviteCodeResult; onClose: () => void }) {
  const link = `${window.location.origin}/rsvp#code=${result.inviteCode}`;
  return (
    <Modal title="Invitation ready" onClose={onClose}>
      <p className="text-sm leading-relaxed text-muted">
        Send this private link to <strong className="text-foreground">{result.household.displayName}</strong>, or give them the code
        to type in at <span className="whitespace-nowrap">/rsvp</span>.
      </p>
      <p role="note" className="mt-4 rounded-lg bg-accent-soft/40 px-3.5 py-2.5 text-sm text-[#6b5228]">
        Copy it now — for security, the code can’t be shown again. If it’s lost, issue a new one.
      </p>
      <div className="mt-5 space-y-4">
        <CopyField id="invite-link" label="Personal invitation link" value={link} />
        <CopyField id="invite-code" label="Invitation code" value={result.inviteCode} />
      </div>
      <div className="mt-6 flex justify-end">
        <button type="button" onClick={onClose} className="btn-primary">
          Done
        </button>
      </div>
    </Modal>
  );
}
