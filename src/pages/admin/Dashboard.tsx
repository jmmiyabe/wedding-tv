import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminHousehold, AdminStats, InviteCodeResult, RsvpStatus } from "../../../shared/api";
import { coupleNames } from "../../../shared/wedding";
import { Spinner } from "../../components/Spinner";
import { api, ApiClientError, errorMessage } from "../../lib/api";
import { formatTimestamp } from "../../lib/format";
import { CodeDialog } from "./CodeDialog";
import { HouseholdDialog } from "./HouseholdDialog";

export const STATUS_LABEL: Record<RsvpStatus, string> = {
  attending: "Attending",
  declined: "Declined",
  pending: "Awaiting reply",
};

export function StatusBadge({ status }: { status: RsvpStatus }) {
  const tone = {
    attending: "bg-sage-soft text-sage-dark",
    declined: "bg-danger-soft text-danger",
    pending: "bg-accent-soft/50 text-[#7a5f2e]",
  }[status];
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${tone}`}>{STATUS_LABEL[status]}</span>;
}

type Filter = "all" | RsvpStatus;

export function Dashboard({ username, onSignedOut }: { username: string; onSignedOut: (notice?: string) => void }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [households, setHouseholds] = useState<AdminHousehold[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<"new" | number | null>(null);
  const [codeResult, setCodeResult] = useState<InviteCodeResult | null>(null);

  const handleError = useCallback(
    (error: unknown) => {
      if (error instanceof ApiClientError && error.status === 401) {
        onSignedOut("Your session has expired. Please sign in again.");
        return true;
      }
      return false;
    },
    [onSignedOut],
  );

  const reload = useCallback(async () => {
    try {
      const [nextStats, list] = await Promise.all([
        api<AdminStats>("/api/admin/stats"),
        api<{ households: AdminHousehold[] }>("/api/admin/households"),
      ]);
      setStats(nextStats);
      setHouseholds(list.households);
      setLoadError(null);
    } catch (error) {
      if (!handleError(error)) setLoadError(errorMessage(error));
    }
  }, [handleError]);

  useEffect(() => {
    // Initial data load; state is only set once the requests resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  async function signOut() {
    await api("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    onSignedOut();
  }

  const visible = useMemo(() => {
    if (!households) return [];
    const query = search.trim().toLowerCase();
    return households.filter((h) => {
      if (filter !== "all" && h.status !== filter) return false;
      if (!query) return true;
      return [h.displayName, ...h.members, ...(h.rsvp?.attendees ?? [])].some((text) => text.toLowerCase().includes(query));
    });
  }, [households, search, filter]);

  const editingHousehold = typeof editing === "number" ? households?.find((h) => h.id === editing) : undefined;

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <p className="font-serif text-2xl leading-tight">{coupleNames()}</p>
            <p className="text-xs text-muted">Signed in as {username}</p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/api/admin/export.csv" download className="btn-outline min-h-10 px-4">
              Export CSV
            </a>
            <button type="button" onClick={() => void signOut()} className="btn-outline min-h-10 px-4">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        {loadError && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {loadError}
            <button type="button" className="font-medium underline" onClick={() => void reload()}>
              Retry
            </button>
          </div>
        )}

        <StatsPanel stats={stats} />

        <section aria-labelledby="guests-title" className="card p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="guests-title" className="font-serif text-3xl">
                Invitations
              </h2>
              <p className="text-sm text-muted">One row per household or invitation group.</p>
            </div>
            <button type="button" className="btn-primary min-h-10 px-5" onClick={() => setEditing("new")}>
              Add invitation
            </button>
          </div>

          <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="md:w-80">
              <label htmlFor="search" className="sr-only">
                Search by name
              </label>
              <input
                id="search"
                type="search"
                placeholder="Search names…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="field-input"
              />
            </div>
            <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
              {(["all", "attending", "declined", "pending"] as const).map((value) => {
                const count = value === "all" ? households?.length : households?.filter((h) => h.status === value).length;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                    className="rounded-full border border-border px-3.5 py-1.5 text-sm transition hover:border-sage aria-pressed:border-sage-dark aria-pressed:bg-sage-dark aria-pressed:text-background focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {value === "all" ? "All" : STATUS_LABEL[value]}
                    {count !== undefined && <span className="ml-1.5 opacity-70">{count}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            {!households && !loadError && (
              <div className="flex justify-center py-16">
                <Spinner label="Loading invitations…" />
              </div>
            )}
            {households && households.length === 0 && (
              <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
                <p className="font-serif text-2xl">No invitations yet</p>
                <p className="mt-2 text-sm text-muted">Add your first household to generate a private invitation link.</p>
              </div>
            )}
            {households && households.length > 0 && visible.length === 0 && (
              <p className="py-12 text-center text-sm text-muted">No invitations match your search.</p>
            )}
            {visible.length > 0 && <GuestList households={visible} onOpen={setEditing} />}
          </div>
        </section>
      </main>

      {editing !== null && (editing === "new" || editingHousehold) && (
        <HouseholdDialog
          household={editingHousehold ?? null}
          onClose={() => setEditing(null)}
          onUnauthorized={handleError}
          onChanged={() => void reload()}
          onCode={(result) => {
            setEditing(null);
            setCodeResult(result);
          }}
        />
      )}
      {codeResult && <CodeDialog result={codeResult} onClose={() => setCodeResult(null)} />}
    </div>
  );
}

function StatsPanel({ stats }: { stats: AdminStats | null }) {
  const value = (n: number | undefined) => (n === undefined ? "–" : n);
  return (
    <section aria-labelledby="overview-title" className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <h2 id="overview-title" className="sr-only">
        Overview
      </h2>
      <div className="card p-5 sm:p-6">
        <p className="eyebrow">Households / invitations</p>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(
            [
              ["Invited", stats?.households.invited],
              ["Attending", stats?.households.attending],
              ["Declined", stats?.households.declined],
              ["Awaiting reply", stats?.households.pending],
            ] as const
          ).map(([label, n]) => (
            <div key={label}>
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="font-serif text-4xl lining-nums tabular-nums">{value(n)}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="card bg-sage-soft/50 p-5 sm:p-6">
        <p className="eyebrow">Individual guests</p>
        <dl className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-muted">Confirmed attendees</dt>
            <dd className="font-serif text-4xl lining-nums tabular-nums">{value(stats?.people.confirmedAttendees)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Seats offered</dt>
            <dd className="font-serif text-4xl lining-nums tabular-nums">{value(stats?.people.invitedSeats)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function GuestList({ households, onOpen }: { households: AdminHousehold[]; onOpen: (id: number) => void }) {
  return (
    <>
      {/* Phones: cards */}
      <ul className="space-y-3 md:hidden">
        {households.map((h) => (
          <li key={h.id}>
            <button
              type="button"
              onClick={() => onOpen(h.id)}
              className="w-full rounded-xl border border-border bg-white/60 p-4 text-left transition hover:border-sage focus-visible:outline-2 focus-visible:outline-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{h.displayName}</p>
                <StatusBadge status={h.status} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {h.rsvp?.attending ? `${h.rsvp.attendees.length} of ${h.maxAttendees} attending` : `${h.maxAttendees} ${h.maxAttendees === 1 ? "seat" : "seats"}`}
                {h.rsvp?.dietary ? " · Dietary note" : ""}
                {!h.hasAccess ? " · Access revoked" : ""}
              </p>
            </button>
          </li>
        ))}
      </ul>

      {/* Tablet and up: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs tracking-wide text-muted uppercase">
            <tr>
              <th scope="col" className="py-3 pr-4 font-medium">Household</th>
              <th scope="col" className="py-3 pr-4 font-medium">Status</th>
              <th scope="col" className="py-3 pr-4 font-medium">Guests</th>
              <th scope="col" className="py-3 pr-4 font-medium">Dietary</th>
              <th scope="col" className="py-3 pr-4 font-medium">Updated</th>
              <th scope="col" className="py-3 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {households.map((h) => (
              <tr key={h.id} className="align-top">
                <td className="py-3.5 pr-4">
                  <p className="font-medium">{h.displayName}</p>
                  {h.rsvp?.attending ? (
                    <p className="mt-0.5 text-xs text-muted">{h.rsvp.attendees.join(", ")}</p>
                  ) : h.members.length > 0 ? (
                    <p className="mt-0.5 text-xs text-muted">{h.members.join(", ")}</p>
                  ) : null}
                  {!h.hasAccess && <p className="mt-1 text-xs font-medium text-danger">Access revoked</p>}
                </td>
                <td className="py-3.5 pr-4"><StatusBadge status={h.status} /></td>
                <td className="py-3.5 pr-4 tabular-nums">
                  {h.rsvp?.attending ? h.rsvp.attendees.length : 0} / {h.maxAttendees}
                </td>
                <td className="max-w-56 py-3.5 pr-4 text-muted">
                  <span className="line-clamp-2">{h.rsvp?.dietary || "—"}</span>
                </td>
                <td className="py-3.5 pr-4 whitespace-nowrap text-muted">{formatTimestamp(h.rsvp?.updatedAt ?? h.updatedAt)}</td>
                <td className="py-3.5 text-right">
                  <button
                    type="button"
                    onClick={() => onOpen(h.id)}
                    className="rounded-full px-3 py-1 font-medium text-sage-dark underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    Open<span className="sr-only"> {h.displayName}</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
