import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { LIMITS, type InvitationView, type RsvpInput } from "../../shared/api";
import { coupleNames, wedding } from "../../shared/wedding";
import { EucalyptusSprig, FloralDivider } from "../components/Botanical";
import { Spinner } from "../components/Spinner";
import { api, ApiClientError, errorMessage } from "../lib/api";
import { formatDate, formatTimestamp } from "../lib/format";
import { Link } from "../lib/router";

type Mode =
  | { name: "loading" }
  | { name: "code"; notice?: string }
  | { name: "error"; message: string }
  | { name: "summary"; view: InvitationView; notice?: string }
  | { name: "form"; view: InvitationView; notice?: string }
  | { name: "confirmed"; view: InvitationView };

/**
 * Reads an invitation code from the URL fragment (`/rsvp#code=XXXX-XXXX-XXXX`)
 * and removes it from the address bar and history straight away. Fragments are
 * never sent to the server or in the Referer header.
 */
function takeCodeFromUrl(): string | null {
  const match = window.location.hash.match(/^#(?:code=)?([A-Za-z0-9 -]{12,20})$/);
  if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
  return match ? decodeURIComponent(match[1]!) : null;
}

function afterLoad(view: InvitationView, notice?: string): Mode {
  if (!view.rsvp && view.canRespond) return { name: "form", view, notice };
  return { name: "summary", view, notice };
}

async function fetchInvitation(): Promise<Mode> {
  try {
    return afterLoad(await api<InvitationView>("/api/invitation"));
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return { name: "code" };
    return { name: "error", message: errorMessage(error) };
  }
}

async function exchangeCode(code: string): Promise<{ mode: Mode } | { problem: string }> {
  try {
    return { mode: afterLoad(await api<InvitationView>("/api/invitation/session", { method: "POST", body: { code } })) };
  } catch (error) {
    if (error instanceof ApiClientError && (error.code === "invalid_code" || error.code === "validation_failed")) {
      return { problem: "We couldn't find an invitation with that code. Please check it and try again." };
    }
    return { problem: errorMessage(error) };
  }
}

export default function RsvpPage() {
  const [mode, setMode] = useState<Mode>({ name: "loading" });
  const started = useRef(false);

  function retry() {
    setMode({ name: "loading" });
    void fetchInvitation().then(setMode);
  }

  async function verify(code: string): Promise<string | null> {
    const result = await exchangeCode(code);
    if ("problem" in result) return result.problem;
    setMode(result.mode);
    return null;
  }

  useEffect(() => {
    document.title = `RSVP · ${coupleNames()}`;
    // Guard against React StrictMode's double effect run: the code is removed
    // from the URL on the first run, so a second run would not see it.
    if (started.current) return;
    started.current = true;
    const code = takeCodeFromUrl();
    const next = code
      ? exchangeCode(code).then((result): Mode => ("problem" in result ? { name: "code", notice: result.problem } : result.mode))
      : fetchInvitation();
    void next.then(setMode);
  }, []);

  async function signOut() {
    await api("/api/invitation/session", { method: "DELETE" }).catch(() => undefined);
    setMode({ name: "code" });
  }

  return (
    <div className="relative isolate min-h-dvh overflow-hidden">
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div className="absolute -top-32 -right-24 size-[28rem] rounded-full bg-sage-soft/70 blur-3xl" />
        <div className="absolute bottom-0 -left-32 size-[26rem] rounded-full bg-accent-soft/35 blur-3xl" />
      </div>
      <EucalyptusSprig className="pointer-events-none absolute top-24 -left-10 -z-10 hidden w-32 text-sage/40 md:block" />
      <EucalyptusSprig className="pointer-events-none absolute -right-8 bottom-10 -z-10 hidden w-36 rotate-180 text-sage/40 md:block" />

      <header className="mx-auto flex max-w-2xl items-center justify-between px-6 pt-6">
        <Link href="/" className="font-serif text-2xl tracking-wide">
          {wedding.couple.partnerOne[0]}
          <span className="mx-1 text-accent italic">&amp;</span>
          {wedding.couple.partnerTwo[0]}
        </Link>
        <Link href="/" className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">
          Back to invitation
        </Link>
      </header>

      <main className="mx-auto max-w-xl px-6 pt-12 pb-24">
        {mode.name === "loading" && (
          <div className="flex justify-center py-24">
            <Spinner label="Loading your invitation…" />
          </div>
        )}
        {mode.name === "error" && (
          <Panel title="Something went wrong">
            <p role="alert" className="text-muted">
              {mode.message}
            </p>
            <button type="button" className="btn-primary mt-8" onClick={retry}>
              Try again
            </button>
          </Panel>
        )}
        {mode.name === "code" && <CodeForm notice={mode.notice} onSubmit={verify} />}
        {mode.name === "summary" && (
          <Summary view={mode.view} notice={mode.notice} onEdit={() => setMode({ name: "form", view: mode.view })} onSignOut={signOut} />
        )}
        {mode.name === "form" && (
          <RsvpForm
            // Remount (resetting the draft) when a conflict reloads a newer saved reply.
            key={mode.view.rsvp?.revision ?? "new"}
            view={mode.view}
            notice={mode.notice}
            onSaved={(view) => setMode({ name: "confirmed", view })}
            onReload={(view, notice) => setMode(view.canRespond ? { name: "form", view, notice } : { name: "summary", view, notice })}
            onExpired={() => setMode({ name: "code", notice: "Your session has expired. Please enter your code again." })}
            onCancel={mode.view.rsvp ? () => setMode({ name: "summary", view: mode.view }) : undefined}
            onSignOut={signOut}
          />
        )}
        {mode.name === "confirmed" && <Confirmation view={mode.view} onEdit={() => setMode({ name: "form", view: mode.view })} />}
      </main>
    </div>
  );
}

function Panel({ eyebrow, title, children }: { eyebrow?: string; title: string; children: ReactNode }) {
  return (
    <section className="text-center" aria-labelledby="panel-title">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 id="panel-title" className="mt-3 font-serif text-4xl font-light text-balance sm:text-5xl">
        {title}
      </h1>
      <FloralDivider className="mt-5 mb-8" />
      {children}
    </section>
  );
}

function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`mb-6 rounded-xl px-4 py-3 text-left text-sm ${tone === "error" ? "bg-danger-soft text-danger" : "bg-sage-soft text-sage-dark"}`}
    >
      {children}
    </p>
  );
}

function CodeForm({ notice, onSubmit }: { notice?: string; onSubmit: (code: string) => Promise<string | null> }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(notice ?? null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (code.trim().length === 0) {
      setError("Please enter the code from your invitation.");
      return;
    }
    setBusy(true);
    setError(await onSubmit(code));
    setBusy(false);
  }

  return (
    <Panel eyebrow="Kindly reply" title="Find your invitation">
      <p className="mx-auto max-w-sm leading-relaxed text-muted">
        Open the personal link we sent you, or enter the invitation code printed on your invitation.
      </p>
      <form onSubmit={submit} noValidate className="card mx-auto mt-10 max-w-sm p-6 text-left sm:p-8">
        <label htmlFor="invite-code" className="field-label">
          Invitation code
        </label>
        <input
          id="invite-code"
          name="invite-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXX-XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={20}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "invite-code-error" : undefined}
          className="field-input text-center font-mono tracking-[0.2em] uppercase"
        />
        {error && (
          <p id="invite-code-error" role="alert" className="field-error">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className="btn-primary mt-6 w-full">
          {busy ? <Spinner small label="Checking…" /> : "Continue"}
        </button>
      </form>
    </Panel>
  );
}

function ResponseDetails({ view }: { view: InvitationView }) {
  const rsvp = view.rsvp!;
  return (
    <dl className="space-y-4 text-left text-sm">
      <div>
        <dt className="text-xs tracking-[0.2em] text-muted uppercase">Reply</dt>
        <dd className="mt-1 font-serif text-2xl">{rsvp.attending ? "Joyfully accepts" : "Regretfully declines"}</dd>
      </div>
      {rsvp.attending && (
        <div>
          <dt className="text-xs tracking-[0.2em] text-muted uppercase">
            {rsvp.attendees.length} {rsvp.attendees.length === 1 ? "guest" : "guests"}
          </dt>
          <dd className="mt-1">{rsvp.attendees.join(", ")}</dd>
        </div>
      )}
      {rsvp.dietary && (
        <div>
          <dt className="text-xs tracking-[0.2em] text-muted uppercase">Dietary requirements</dt>
          <dd className="mt-1 whitespace-pre-line">{rsvp.dietary}</dd>
        </div>
      )}
      {rsvp.message && (
        <div>
          <dt className="text-xs tracking-[0.2em] text-muted uppercase">Your message</dt>
          <dd className="mt-1 whitespace-pre-line">{rsvp.message}</dd>
        </div>
      )}
      <p className="pt-2 text-xs text-muted">Last updated {formatTimestamp(rsvp.updatedAt)}</p>
    </dl>
  );
}

function ClosedNote({ view }: { view: InvitationView }) {
  return (
    <p className="mt-6 text-sm leading-relaxed text-muted">
      Replies closed on {formatDate(view.deadline)}. If anything has changed, please{" "}
      <Link href="/#contact" className="text-sage-dark underline underline-offset-4">
        contact us
      </Link>
      .
    </p>
  );
}

function Summary({ view, notice, onEdit, onSignOut }: { view: InvitationView; notice?: string; onEdit: () => void; onSignOut: () => void }) {
  return (
    <Panel eyebrow={view.householdName} title={view.rsvp ? "Your reply" : "RSVP closed"}>
      {notice && <Notice>{notice}</Notice>}
      {view.rsvp ? (
        <div className="card p-6 sm:p-8">
          <ResponseDetails view={view} />
        </div>
      ) : null}
      {view.canRespond ? (
        <>
          <button type="button" onClick={onEdit} className="btn-primary mt-8">
            Change my reply
          </button>
          <p className="mt-4 text-sm text-muted">You can update your reply until {formatDate(view.deadline)}.</p>
        </>
      ) : (
        <ClosedNote view={view} />
      )}
      <SignOutLink onSignOut={onSignOut} />
    </Panel>
  );
}

function SignOutLink({ onSignOut }: { onSignOut: () => void }) {
  return (
    <p className="mt-10 text-sm text-muted">
      Not your invitation?{" "}
      <button type="button" onClick={onSignOut} className="text-sage-dark underline underline-offset-4 hover:text-foreground">
        Use a different code
      </button>
    </p>
  );
}

function Confirmation({ view, onEdit }: { view: InvitationView; onEdit: () => void }) {
  const attending = view.rsvp?.attending;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className="text-center" aria-labelledby="confirmation-title">
      <p className="eyebrow">Reply received</p>
      <h1 id="confirmation-title" ref={headingRef} tabIndex={-1} className="mt-3 font-serif text-5xl font-light outline-none">
        Thank you
      </h1>
      <FloralDivider className="mt-5 mb-8" />
      <p className="mx-auto max-w-md font-serif text-xl leading-relaxed text-muted italic">
        {attending
          ? `We're so happy you'll be celebrating with us, ${view.householdName}. We can't wait to see you.`
          : `We'll miss you, ${view.householdName}, and we're grateful you let us know.`}
      </p>
      <div className="card mt-10 p-6 sm:p-8">
        <ResponseDetails view={view} />
      </div>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href="/" className="btn-primary w-full sm:w-auto">
          Back to the invitation
        </Link>
        {view.canRespond && (
          <button type="button" onClick={onEdit} className="btn-outline w-full sm:w-auto">
            Edit my reply
          </button>
        )}
      </div>
    </section>
  );
}

interface Draft {
  attending: boolean | null;
  count: number;
  names: string[];
  dietary: string;
  message: string;
}

function initialDraft(view: InvitationView): Draft {
  const source = view.rsvp?.attending ? view.rsvp.attendees : view.members;
  const names = Array.from({ length: view.maxAttendees }, (_, i) => source[i] ?? "");
  return {
    attending: view.rsvp ? view.rsvp.attending : null,
    count: Math.max(1, Math.min(view.maxAttendees, view.rsvp?.attending ? view.rsvp.attendees.length : view.members.length || 1)),
    names,
    dietary: view.rsvp?.dietary ?? "",
    message: view.rsvp?.message ?? "",
  };
}

function RsvpForm({
  view,
  notice,
  onSaved,
  onReload,
  onExpired,
  onCancel,
  onSignOut,
}: {
  view: InvitationView;
  notice?: string;
  onSaved: (view: InvitationView) => void;
  onReload: (view: InvitationView, notice: string) => void;
  onExpired: () => void;
  onCancel?: () => void;
  onSignOut: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(view));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const ids = useId();

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (draft.attending === null) next.attending = "Please let us know whether you can attend.";
    if (draft.attending) {
      draft.names.slice(0, draft.count).forEach((name, i) => {
        if (!name.trim()) next[`name-${i}`] = "Please enter a name.";
      });
    }
    if (draft.dietary.length > LIMITS.dietaryLength) next.dietary = `Please keep this under ${LIMITS.dietaryLength} characters.`;
    if (draft.message.length > LIMITS.messageLength) next.message = `Please keep this under ${LIMITS.messageLength} characters.`;
    return next;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
      return;
    }

    const body: RsvpInput = {
      attending: draft.attending!,
      attendees: draft.attending ? draft.names.slice(0, draft.count).map((n) => n.trim()) : [],
      dietary: draft.attending ? draft.dietary : "",
      message: draft.message,
      revision: view.rsvp?.revision ?? null,
    };

    setBusy(true);
    try {
      onSaved(await api<InvitationView>("/api/invitation/rsvp", { method: "PUT", body }));
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) return onExpired();
      if (error instanceof ApiClientError && (error.code === "conflict" || error.code === "rsvp_closed")) {
        const latest = await api<InvitationView>("/api/invitation").catch(() => null);
        if (latest) return onReload(latest, errorMessage(error));
      }
      if (error instanceof ApiClientError && error.code === "validation_failed") {
        setErrors({ ...(error.fields.attendees ? { "name-0": error.fields.attendees } : {}), ...error.fields });
      }
      setFormError(errorMessage(error));
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
    } finally {
      setBusy(false);
    }
  }

  const errorList = Object.values(errors);
  const seatsText = `${view.maxAttendees} ${view.maxAttendees === 1 ? "seat" : "seats"}`;

  return (
    <Panel eyebrow="Kindly reply" title={`Dear ${view.householdName}`}>
      <p className="mx-auto max-w-md leading-relaxed text-muted">
        We have reserved <strong className="font-semibold text-foreground">{seatsText}</strong> in your honour. Please reply by{" "}
        {formatDate(view.deadline)}.
      </p>
      {view.deadlinePassed && (
        <p className="mt-3 text-sm text-muted">The reply date has passed, but we're still happy to hear from you.</p>
      )}

      <form onSubmit={submit} noValidate className="card mt-10 space-y-8 p-6 text-left sm:p-8" aria-busy={busy}>
        <div ref={errorSummaryRef} tabIndex={-1} className="outline-none empty:hidden">
          {notice && <Notice>{notice}</Notice>}
          {(formError || errorList.length > 0) && (
            <Notice tone="error">{formError ?? "Please check the highlighted fields."}</Notice>
          )}
        </div>

        <fieldset aria-describedby={errors.attending ? `${ids}-attending-error` : undefined}>
          <legend className="field-label">Will you be joining us?</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {[
              { value: true, label: "Joyfully accepts" },
              { value: false, label: "Regretfully declines" },
            ].map((option) => (
              <label
                key={String(option.value)}
                className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-border bg-white/70 px-4 transition has-checked:border-sage has-checked:bg-sage-soft/60 has-focus-visible:ring-2 has-focus-visible:ring-sage/40"
              >
                <input
                  type="radio"
                  name="attending"
                  checked={draft.attending === option.value}
                  onChange={() => update("attending", option.value)}
                  className="size-4 accent-sage-dark"
                />
                <span className="font-serif text-xl">{option.label}</span>
              </label>
            ))}
          </div>
          {errors.attending && (
            <p id={`${ids}-attending-error`} className="field-error">
              {errors.attending}
            </p>
          )}
        </fieldset>

        {draft.attending && (
          <>
            {view.maxAttendees > 1 && (
              <div>
                <label htmlFor={`${ids}-count`} className="field-label">
                  How many of you will attend?
                </label>
                <select
                  id={`${ids}-count`}
                  value={draft.count}
                  onChange={(e) => update("count", Number(e.target.value))}
                  className="field-input"
                >
                  {Array.from({ length: view.maxAttendees }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "guest" : "guests"}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <fieldset className="space-y-3">
              <legend className="field-label">{draft.count === 1 ? "Name of guest" : "Names of everyone attending"}</legend>
              {draft.names.slice(0, draft.count).map((name, i) => {
                const key = `name-${i}`;
                return (
                  <div key={i}>
                    <label htmlFor={`${ids}-${key}`} className="sr-only">
                      Guest {i + 1} full name
                    </label>
                    <input
                      id={`${ids}-${key}`}
                      value={name}
                      onChange={(e) => update("names", draft.names.map((n, j) => (j === i ? e.target.value : n)))}
                      placeholder={`Guest ${i + 1} full name`}
                      autoComplete={i === 0 ? "name" : "off"}
                      maxLength={LIMITS.nameLength}
                      aria-invalid={errors[key] ? true : undefined}
                      aria-describedby={errors[key] ? `${ids}-${key}-error` : undefined}
                      className="field-input"
                    />
                    {errors[key] && (
                      <p id={`${ids}-${key}-error`} className="field-error">
                        {errors[key]}
                      </p>
                    )}
                  </div>
                );
              })}
            </fieldset>

            <TextArea
              id={`${ids}-dietary`}
              label="Dietary requirements or allergies"
              hint="Optional — please include who each one is for."
              value={draft.dietary}
              max={LIMITS.dietaryLength}
              error={errors.dietary}
              onChange={(v) => update("dietary", v)}
            />
          </>
        )}

        <TextArea
          id={`${ids}-message`}
          label="A note for the couple"
          hint="Optional"
          value={draft.message}
          max={LIMITS.messageLength}
          error={errors.message}
          onChange={(v) => update("message", v)}
        />

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          {onCancel && (
            <button type="button" onClick={onCancel} className="btn-outline">
              Cancel
            </button>
          )}
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? <Spinner small label="Sending…" /> : view.rsvp ? "Update my reply" : "Send my reply"}
          </button>
        </div>
      </form>
      <SignOutLink onSignOut={onSignOut} />
    </Panel>
  );
}

function TextArea({
  id,
  label,
  hint,
  value,
  max,
  error,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  max: number;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <p id={`${id}-hint`} className="-mt-1 mb-2 text-xs text-muted">
        {hint}
      </p>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={max}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
        className="field-input resize-y"
      />
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
