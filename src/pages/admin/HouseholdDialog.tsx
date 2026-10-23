import { useId, useState, type FormEvent } from "react";
import { LIMITS, type AdminHousehold, type InviteCodeResult, type RsvpInput } from "../../../shared/api";
import { Spinner } from "../../components/Spinner";
import { api, ApiClientError, errorMessage } from "../../lib/api";
import { formatTimestamp } from "../../lib/format";
import { StatusBadge } from "./Dashboard";
import { Modal, useConfirm } from "./Modal";

interface Props {
  household: AdminHousehold | null;
  onClose: () => void;
  /** Returns true if the error was a lost session (and has been handled). */
  onUnauthorized: (error: unknown) => boolean;
  onChanged: () => void;
  onCode: (result: InviteCodeResult) => void;
}

const lines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export function HouseholdDialog({ household, onClose, onUnauthorized, onChanged, onCode }: Props) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function run(name: string, action: () => Promise<void>) {
    setBusyAction(name);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      if (!onUnauthorized(error)) setActionError(errorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  const path = household ? `/api/admin/households/${household.id}` : null;

  async function issueCode() {
    if (!household || !path) return;
    const ok = await confirm({
      title: household.hasAccess ? "Issue a new code?" : "Restore access?",
      message: household.hasAccess
        ? `The current link and code for ${household.displayName} will stop working immediately. You'll need to send them the new one.`
        : `A new link and code will be created for ${household.displayName}.`,
      confirmLabel: "Issue new code",
    });
    if (!ok) return;
    await run("code", async () => {
      const result = await api<InviteCodeResult>(`${path}/invite-code`, { method: "POST" });
      onChanged();
      onCode(result);
    });
  }

  async function revoke() {
    if (!household || !path) return;
    const ok = await confirm({
      title: "Revoke access?",
      message: `${household.displayName}'s link and code will stop working and they'll be signed out. Their RSVP is kept. You can issue a new code later.`,
      confirmLabel: "Revoke access",
      danger: true,
    });
    if (ok) await run("revoke", async () => void (await api(`${path}/invite-code`, { method: "DELETE" }), onChanged()));
  }

  async function remove() {
    if (!household || !path) return;
    const ok = await confirm({
      title: "Delete this invitation?",
      message: `This permanently deletes ${household.displayName}, their RSVP and their access. This cannot be undone.`,
      confirmLabel: "Delete permanently",
      danger: true,
    });
    if (!ok) return;
    await run("delete", async () => {
      await api(path, { method: "DELETE" });
      onChanged();
      onClose();
    });
  }

  return (
    <Modal title={household ? household.displayName : "New invitation"} onClose={onClose} wide>
      <div className="space-y-8">
        {actionError && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
            {actionError}
          </p>
        )}

        <DetailsForm household={household} onUnauthorized={onUnauthorized} onChanged={onChanged} onCode={onCode} />

        {household && (
          <>
            <RsvpSection household={household} onUnauthorized={onUnauthorized} onChanged={onChanged} confirm={confirm} />

            <section aria-labelledby="access-title" className="border-t border-border pt-6">
              <h3 id="access-title" className="font-serif text-2xl">
                Invitation access
              </h3>
              <p className="mt-1 text-sm text-muted">
                {household.hasAccess
                  ? "Their private link and code are active. Codes are stored securely and can't be displayed again — issue a new one if it was lost."
                  : "Access is revoked: their old link and code no longer work."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn-outline min-h-10 px-4" disabled={busyAction !== null} onClick={() => void issueCode()}>
                  {busyAction === "code" ? <Spinner small label="Issuing…" /> : household.hasAccess ? "Issue new code" : "Restore with new code"}
                </button>
                {household.hasAccess && (
                  <button type="button" className="btn-outline min-h-10 px-4" disabled={busyAction !== null} onClick={() => void revoke()}>
                    {busyAction === "revoke" ? <Spinner small label="Revoking…" /> : "Revoke access"}
                  </button>
                )}
              </div>
            </section>

            <section aria-labelledby="danger-title" className="border-t border-border pt-6">
              <h3 id="danger-title" className="font-serif text-2xl">
                Delete invitation
              </h3>
              <p className="mt-1 text-sm text-muted">Removes this household and their RSVP permanently.</p>
              <button type="button" className="btn-danger mt-4 min-h-10 px-4" disabled={busyAction !== null} onClick={() => void remove()}>
                {busyAction === "delete" ? <Spinner small label="Deleting…" /> : "Delete invitation"}
              </button>
            </section>
          </>
        )}
      </div>
      {confirmDialog}
    </Modal>
  );
}

function DetailsForm({
  household,
  onUnauthorized,
  onChanged,
  onCode,
}: Pick<Props, "household" | "onUnauthorized" | "onChanged" | "onCode">) {
  const ids = useId();
  const [displayName, setDisplayName] = useState(household?.displayName ?? "");
  const [maxAttendees, setMaxAttendees] = useState(String(household?.maxAttendees ?? 2));
  const [members, setMembers] = useState(household?.members.join("\n") ?? "");
  const [notes, setNotes] = useState(household?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const body = { displayName: displayName.trim(), maxAttendees: Number(maxAttendees), members: lines(members), notes: notes.trim() };
    const found: Record<string, string> = {};
    if (!body.displayName) found.displayName = "Please enter a name.";
    if (!Number.isInteger(body.maxAttendees) || body.maxAttendees < 1 || body.maxAttendees > LIMITS.maxAttendeesCap) {
      found.maxAttendees = `Enter a number from 1 to ${LIMITS.maxAttendeesCap}.`;
    }
    if (body.members.length > body.maxAttendees) found.members = "List no more named guests than the seats offered.";
    setErrors(found);
    setStatus(null);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      if (household) {
        await api(`/api/admin/households/${household.id}`, { method: "PATCH", body });
        setStatus({ tone: "ok", text: "Saved." });
        onChanged();
      } else {
        const result = await api<InviteCodeResult>("/api/admin/households", { method: "POST", body });
        onChanged();
        onCode(result);
      }
    } catch (error) {
      if (onUnauthorized(error)) return;
      if (error instanceof ApiClientError) setErrors(error.fields);
      setStatus({ tone: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  const field = (key: string) => ({
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `${ids}-${key}-error` : undefined,
  });
  const error = (key: string) =>
    errors[key] && (
      <p id={`${ids}-${key}-error`} className="field-error">
        {errors[key]}
      </p>
    );

  return (
    <form onSubmit={save} noValidate className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-[1fr_9rem]">
        <div>
          <label htmlFor={`${ids}-name`} className="field-label">
            Household or guest name
          </label>
          <input
            id={`${ids}-name`}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={LIMITS.householdNameLength}
            placeholder="e.g. The Smith Family"
            className="field-input"
            {...field("displayName")}
          />
          {error("displayName")}
        </div>
        <div>
          <label htmlFor={`${ids}-max`} className="field-label">
            Seats offered
          </label>
          <input
            id={`${ids}-max`}
            type="number"
            inputMode="numeric"
            min={1}
            max={LIMITS.maxAttendeesCap}
            value={maxAttendees}
            onChange={(e) => setMaxAttendees(e.target.value)}
            className="field-input"
            {...field("maxAttendees")}
          />
          {error("maxAttendees")}
        </div>
      </div>
      <div>
        <label htmlFor={`${ids}-members`} className="field-label">
          Invited guests <span className="font-normal text-muted">(optional, one per line)</span>
        </label>
        <textarea
          id={`${ids}-members`}
          value={members}
          onChange={(e) => setMembers(e.target.value)}
          rows={3}
          placeholder={"Anna Smith\nBen Smith"}
          className="field-input"
          {...field("members")}
        />
        {error("members") || <p className="mt-1.5 text-xs text-muted">Used to prefill the guest’s RSVP form.</p>}
      </div>
      <div>
        <label htmlFor={`${ids}-notes`} className="field-label">
          Private notes <span className="font-normal text-muted">(never shown to guests)</span>
        </label>
        <textarea
          id={`${ids}-notes`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          maxLength={LIMITS.notesLength}
          className="field-input"
          {...field("notes")}
        />
        {error("notes")}
      </div>
      <div className="flex items-center justify-end gap-3">
        {status && (
          <p role={status.tone === "error" ? "alert" : "status"} className={`text-sm ${status.tone === "error" ? "text-danger" : "text-sage-dark"}`}>
            {status.text}
          </p>
        )}
        <button type="submit" disabled={busy} className="btn-primary min-h-10 px-5">
          {busy ? <Spinner small label="Saving…" /> : household ? "Save changes" : "Create invitation"}
        </button>
      </div>
    </form>
  );
}

function RsvpSection({
  household,
  onUnauthorized,
  onChanged,
  confirm,
}: Pick<Props, "onUnauthorized" | "onChanged"> & { household: AdminHousehold; confirm: ReturnType<typeof useConfirm>["confirm"] }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rsvp = household.rsvp;

  async function clear() {
    const ok = await confirm({
      title: "Clear this reply?",
      message: `${household.displayName} will go back to “Awaiting reply”. Their answer, names, dietary notes and message are removed.`,
      confirmLabel: "Clear reply",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/admin/households/${household.id}/rsvp`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      if (!onUnauthorized(err)) setError(errorMessage(err));
    }
  }

  return (
    <section aria-labelledby="rsvp-title" className="border-t border-border pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="rsvp-title" className="flex items-center gap-3 font-serif text-2xl">
          RSVP <StatusBadge status={household.status} />
        </h3>
        {!editing && (
          <div className="flex gap-2">
            <button type="button" className="btn-outline min-h-10 px-4" onClick={() => setEditing(true)}>
              {rsvp ? "Edit reply" : "Record reply"}
            </button>
            {rsvp && (
              <button type="button" className="btn-outline min-h-10 px-4" onClick={() => void clear()}>
                Clear
              </button>
            )}
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      {editing ? (
        <RsvpEditor
          // Remount if the saved reply changes underneath us.
          key={rsvp?.revision ?? "new"}
          household={household}
          onDone={() => setEditing(false)}
          onUnauthorized={onUnauthorized}
          onChanged={onChanged}
        />
      ) : rsvp ? (
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Attendees</dt>
            <dd className="mt-0.5">{rsvp.attending ? rsvp.attendees.join(", ") : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Dietary requirements</dt>
            <dd className="mt-0.5 whitespace-pre-line">{rsvp.dietary || "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Message</dt>
            <dd className="mt-0.5 whitespace-pre-line">{rsvp.message || "—"}</dd>
          </div>
          <p className="text-xs text-muted sm:col-span-2">
            {rsvp.respondedBy === "admin" ? "Recorded by an administrator" : "Submitted by the guest"} · {formatTimestamp(rsvp.updatedAt)}
          </p>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-muted">No reply yet. You can record one on their behalf (the RSVP deadline doesn’t apply here).</p>
      )}
    </section>
  );
}

function RsvpEditor({
  household,
  onDone,
  onUnauthorized,
  onChanged,
}: Pick<Props, "onUnauthorized" | "onChanged"> & { household: AdminHousehold; onDone: () => void }) {
  const ids = useId();
  const rsvp = household.rsvp;
  const [attending, setAttending] = useState<boolean>(rsvp?.attending ?? true);
  const [names, setNames] = useState((rsvp?.attending ? rsvp.attendees : household.members).join("\n"));
  const [dietary, setDietary] = useState(rsvp?.dietary ?? "");
  const [message, setMessage] = useState(rsvp?.message ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const attendees = attending ? lines(names) : [];
    if (attending && attendees.length === 0) return setError("Add at least one attendee name.");
    if (attendees.length > household.maxAttendees) return setError(`This invitation allows up to ${household.maxAttendees} guests.`);

    const body: RsvpInput = { attending, attendees, dietary: attending ? dietary.trim() : "", message: message.trim(), revision: rsvp?.revision ?? null };
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/households/${household.id}/rsvp`, { method: "PUT", body });
      onChanged();
      onDone();
    } catch (err) {
      if (onUnauthorized(err)) return;
      if (err instanceof ApiClientError && err.code === "conflict") onChanged();
      setError(err instanceof ApiClientError && err.fields.attendees ? err.fields.attendees : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="mt-4 space-y-4 rounded-xl border border-border bg-cream/40 p-4">
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <fieldset>
        <legend className="field-label">Reply</legend>
        <div className="flex flex-wrap gap-4">
          {[
            { value: true, label: "Attending" },
            { value: false, label: "Declined" },
          ].map((option) => (
            <label key={option.label} className="flex items-center gap-2 text-sm">
              <input type="radio" name={`${ids}-attending`} checked={attending === option.value} onChange={() => setAttending(option.value)} className="accent-sage-dark" />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
      {attending && (
        <>
          <div>
            <label htmlFor={`${ids}-names`} className="field-label">
              Attendee names <span className="font-normal text-muted">(one per line, up to {household.maxAttendees})</span>
            </label>
            <textarea id={`${ids}-names`} value={names} onChange={(e) => setNames(e.target.value)} rows={3} className="field-input" />
          </div>
          <div>
            <label htmlFor={`${ids}-dietary`} className="field-label">
              Dietary requirements
            </label>
            <textarea id={`${ids}-dietary`} value={dietary} onChange={(e) => setDietary(e.target.value)} rows={2} maxLength={LIMITS.dietaryLength} className="field-input" />
          </div>
        </>
      )}
      <div>
        <label htmlFor={`${ids}-message`} className="field-label">
          Message
        </label>
        <textarea id={`${ids}-message`} value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={LIMITS.messageLength} className="field-input" />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-outline min-h-10 px-4" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" disabled={busy} className="btn-primary min-h-10 px-5">
          {busy ? <Spinner small label="Saving…" /> : "Save reply"}
        </button>
      </div>
    </form>
  );
}
