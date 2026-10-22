# Wedding Invitation — Phase 1 Foundation

Vite + React + TypeScript + Tailwind CSS v4 frontend, Cloudflare Pages Functions API, Cloudflare D1 database.

```
src/            React SPA (pages, components)
functions/api/  Pages Functions (file-based routes under /api)
server/         Shared server code (env bindings, HTTP helpers) — not routed
migrations/     D1 SQL migrations (applied in filename order)
public/_headers Security + cache headers for the deployed site
wrangler.toml   Pages + D1 binding config (source of truth for bindings)
```

## Requirements

- Node.js 22+, pnpm 10+
- A Cloudflare account (`pnpm exec wrangler login`)

No environment variables or secrets are needed in Phase 1. The only server
dependency is the `DB` D1 binding declared in `wrangler.toml`. Put future secrets
in `.dev.vars` for local use (gitignored) and in Cloudflare with
`wrangler pages secret put`.

## Local development

```bash
pnpm install
pnpm db:migrate:local          # creates the local SQLite D1 under .wrangler/state
```

Full stack (static build + Functions + local D1), closest to production:

```bash
pnpm preview                   # http://localhost:8788
curl localhost:8788/api/health # {"status":"ok","database":"connected","schemaVersion":1,...}
```

Frontend with hot reload: run `pnpm dev:api` in one terminal (it serves the last
`dist` build plus Functions on :8788), then `pnpm dev` in another. Vite proxies `/api` to :8788.

The local database lives only in `.wrangler/state/`. Local commands never touch
production unless you pass `--remote`.

## First deployment

1. Create the production database:
   ```bash
   pnpm exec wrangler d1 create wedding-db
   ```
   Copy the printed `database_id` into `wrangler.toml`, replacing the
   placeholder. It is an identifier, not a secret, so it is safe to commit.
2. Apply migrations to production:
   ```bash
   pnpm db:migrate:remote
   ```
3. Create the Pages project. Pick one:
   - **Git integration:** In the Cloudflare dashboard, open Workers & Pages,
     click Create, then Pages and Connect to Git. Use build command
     `pnpm build` and output directory `dist`. Set the env var `NODE_VERSION=22`.
   - **Direct upload:** `pnpm build && pnpm exec wrangler pages deploy`
4. Verify: `curl https://<project>.pages.dev/api/health`

## Migrations

- Add a new file `migrations/000N_description.sql`. Never edit a migration that
  has already been applied.
- End every migration with
  `INSERT INTO schema_migrations (version, name) VALUES (N, 'description');`
  so `/api/health` reports the current version.
- Apply it locally with `pnpm db:migrate:local`. After testing, apply it to
  production with `pnpm db:migrate:remote`. Run the remote migration before you
  deploy code that depends on it.
- Wrangler records which files it has applied in its own `d1_migrations` table.
  `schema_migrations` is the record the app can read.

## API conventions

- Every response is JSON with `Cache-Control: no-store`.
- Errors return `{ "error": "<code>" }` with a generic code. Raw exception
  messages go only to `console.error`, which shows up in Cloudflare logs.
- Unknown `/api/*` paths return a JSON 404. They never fall through to the SPA.
- Use D1 prepared statements with `.bind()`. Never interpolate values into SQL.

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm build
```
