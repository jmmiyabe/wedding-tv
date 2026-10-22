-- Migration 0001: application-visible schema version tracking.
-- Wrangler separately records applied files in its own `d1_migrations` table;
-- this table lets the app (e.g. /api/health) report the current schema version.
-- Every future migration should end with an INSERT into this table.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  applied_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO schema_migrations (version, name) VALUES (1, 'schema_migrations');
