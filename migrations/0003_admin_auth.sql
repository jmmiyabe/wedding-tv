-- Migration 0003: administrator accounts and sessions.
-- There is no registration endpoint. Accounts are created with `pnpm admin`
-- (see README → "Administrator accounts").

CREATE TABLE admins (
  id                   INTEGER PRIMARY KEY,
  username             TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(username) BETWEEN 3 AND 32),
  -- "pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>"
  password_hash        TEXT    NOT NULL,
  failed_logins        INTEGER NOT NULL DEFAULT 0,
  locked_until         TEXT,
  password_changed_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE admin_sessions (
  token_hash  TEXT    PRIMARY KEY,
  admin_id    INTEGER NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  TEXT    NOT NULL
) STRICT;

CREATE INDEX admin_sessions_admin_idx ON admin_sessions (admin_id);
CREATE INDEX admin_sessions_expires_idx ON admin_sessions (expires_at);

INSERT INTO schema_migrations (version, name) VALUES (3, 'admin_auth');
