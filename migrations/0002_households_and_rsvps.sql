-- Migration 0002: invited households, their RSVP responses, guest sessions, and
-- rate limiting.
--
-- RSVP status is derived, not stored: no `rsvps` row = pending; otherwise
-- `attending` says whether the household accepted or declined.

-- One row per invitation (a person or a household).
CREATE TABLE households (
  id                INTEGER PRIMARY KEY,
  display_name      TEXT    NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  max_attendees     INTEGER NOT NULL CHECK (max_attendees BETWEEN 1 AND 20),
  -- SHA-256 (hex) of the normalized invitation code. The code itself is never stored.
  -- NULL means invitation access has been revoked.
  invite_code_hash  TEXT    UNIQUE,
  -- Private notes for administrators; never shown to guests.
  notes             TEXT    NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX households_display_name_idx ON households (display_name COLLATE NOCASE);

-- Optional named invitees, used to prefill the RSVP form.
CREATE TABLE household_members (
  household_id  INTEGER NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  position      INTEGER NOT NULL CHECK (position >= 0),
  full_name     TEXT    NOT NULL CHECK (length(full_name) BETWEEN 1 AND 100),
  PRIMARY KEY (household_id, position)
) STRICT;

-- At most one response per household (the primary key prevents duplicates).
CREATE TABLE rsvps (
  household_id    INTEGER PRIMARY KEY REFERENCES households (id) ON DELETE CASCADE,
  attending       INTEGER NOT NULL CHECK (attending IN (0, 1)),
  attendee_count  INTEGER NOT NULL CHECK (attendee_count BETWEEN 0 AND 20),
  dietary         TEXT    NOT NULL DEFAULT '' CHECK (length(dietary) <= 500),
  message         TEXT    NOT NULL DEFAULT '' CHECK (length(message) <= 1000),
  -- Random token replaced on every write; used for optimistic concurrency.
  revision        TEXT    NOT NULL,
  responded_by    TEXT    NOT NULL CHECK (responded_by IN ('guest', 'admin')),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((attending = 0 AND attendee_count = 0) OR (attending = 1 AND attendee_count >= 1))
) STRICT;

CREATE INDEX rsvps_attending_idx ON rsvps (attending);

-- Names of the people attending, one row per seat.
CREATE TABLE rsvp_attendees (
  household_id  INTEGER NOT NULL REFERENCES rsvps (household_id) ON DELETE CASCADE,
  position      INTEGER NOT NULL CHECK (position >= 0),
  full_name     TEXT    NOT NULL CHECK (length(full_name) BETWEEN 1 AND 100),
  PRIMARY KEY (household_id, position)
) STRICT;

-- Short-lived sessions created after a guest proves they hold an invitation code.
CREATE TABLE guest_sessions (
  token_hash    TEXT    PRIMARY KEY,
  household_id  INTEGER NOT NULL REFERENCES households (id) ON DELETE CASCADE,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at    TEXT    NOT NULL
) STRICT;

CREATE INDEX guest_sessions_household_idx ON guest_sessions (household_id);
CREATE INDEX guest_sessions_expires_idx ON guest_sessions (expires_at);

-- Fixed-window request counters. `key` is "<scope>:<sha256 of client identifier>".
CREATE TABLE rate_limits (
  key           TEXT    PRIMARY KEY,
  window_start  INTEGER NOT NULL,
  count         INTEGER NOT NULL
) STRICT;

CREATE INDEX rate_limits_window_idx ON rate_limits (window_start);

INSERT INTO schema_migrations (version, name) VALUES (2, 'households_and_rsvps');
