# Wedding Invitation & RSVP

A private wedding website: a public digital invitation, per-household RSVP links, and an admin dashboard.
It runs entirely on Cloudflare's free tier.

- **Frontend:** Vite, React 19, TypeScript, Tailwind CSS v4, built as a static SPA.
- **API:** Cloudflare Pages Functions under `/api/*`.
- **Database:** Cloudflare D1 (SQLite), reached only from server code through the `DB` binding.
- **No external services:** no auth provider, email service, analytics or third-party scripts. Fonts are self-hosted.

```
shared/wedding.ts   ← ALL wedding content + RSVP deadline/policy (edit this)
shared/api.ts       Request/response types and input limits shared by client and server
src/                React SPA: / (invitation), /rsvp, /admin
functions/api/      Pages Functions entry points (/api/health, catch-all → server/router.ts)
server/             API: router + access control, sessions, validation, rate limiting, D1 queries
migrations/         D1 SQL migrations, applied in filename order
scripts/            admin.mjs (admin accounts), seed-dev.mjs (local sample data), smoke.mjs
tests/              Vitest suites run against a real, freshly migrated local D1
public/_headers     Security headers (enforced CSP) for static assets
wrangler.toml       Pages + D1 binding config (source of truth for bindings)
```

## Editing the wedding details

Everything guests see lives in **`shared/wedding.ts`**: names, date, venues, map links, schedule,
dress code, reminders, story, gallery, contact details, and the RSVP deadline. The server reads the same
file to enforce the deadline, so the two never disagree.

- Write times as ISO timestamps **with the UTC offset in effect in `timeZone` on that date**
  (e.g. `-04:00` for New York in June). `pnpm test` fails if an offset doesn't match the time zone.
- `rsvp.allowLateResponses: true` lets guests keep replying after the deadline. Administrators can
  always record replies manually.
- Photos: put optimised JPEG/WebP files (ideally under 300 KB, about 1600 px on the long edge) in `public/images/`
  and update `hero.image` / `gallery`. Set `story: []` or `gallery: []` to hide those sections.
- This file is public. Don't put guest names or anything private in it.

Changes go live when you push to GitHub (see Deployment).

## Local development

Requirements: Node.js 22+ and pnpm (`corepack enable`, or run `corepack pnpm …`).

```bash
pnpm install
pnpm db:migrate:local                 # local SQLite D1 in .wrangler/state (gitignored)
pnpm db:seed:local                    # optional: 3 "[Sample]" households with known test codes
pnpm admin create yourname --local    # prints a generated password once
pnpm preview                          # build + Pages runtime + Functions + local D1 → http://localhost:8788
```

Open `http://localhost:8788/admin` to sign in. The seed script prints invitation links such as
`http://localhost:8788/rsvp#code=TEST-AAAA-0001`.

For hot reload, run `pnpm dev:api` (it serves the last `dist` build plus Functions on :8788) and
`pnpm dev` (Vite on :3000, which proxies `/api` to :8788).

Local commands never touch production unless you pass `--remote`. The seed script refuses `--remote` outright.

## Administrator accounts

There is no registration page. Accounts are managed with a CLI that runs against D1, so whoever controls
the Cloudflare account controls admin access.

```bash
pnpm admin create <username> --remote            # generate a strong password, shown once
pnpm admin create <username> --remote --password-stdin < pw.txt   # or supply your own (12+ chars)
pnpm admin reset-password <username> --remote    # rotate: new password, signs out their sessions, clears lockout
pnpm admin delete <username> --remote
pnpm admin sign-out-all --remote                 # end every admin session (e.g. after a lost phone)
pnpm admin list --remote
```

- **First admin (bootstrap):** after the first deployment, run `pnpm exec wrangler login`, then
  `pnpm admin create <username> --remote`. Store the printed password in a password manager.
- **Rotate:** `reset-password` regularly or whenever a password may have been seen.
- **Recover (forgot password or locked out):** any admin with Cloudflare access runs `reset-password`.
  If the Cloudflare account itself is lost, recover it through Cloudflare's account recovery first.
- Passwords are hashed in the script (PBKDF2-SHA256, random salt). Only the hash is sent to D1.

## Sending invitations

1. In `/admin`, click **Add invitation**: household name, seats offered, optional named guests (to prefill
   their form), and private notes.
2. Copy the **personal link** (`https://<site>/rsvp#code=XXXX-XXXX-XXXX`) or the **code** from the dialog.
   **It is shown only once**: the database stores only a hash.
3. If a code is lost, open the household and choose **Issue new code**. The old link stops working
   immediately. **Revoke access** disables the link without deleting their RSVP.

Guests open the link, or type the code at `/rsvp`, and get a 24-hour session for their own invitation only.
They can change their reply until the deadline. **Export CSV** downloads every response for caterers and
seating plans.

## Testing

```bash
pnpm test             # 56 tests: API, auth, RSVP rules, CSV, migrations, config, page render
pnpm check            # typecheck + lint + tests + production build
pnpm test:smoke [url] # read-only checks against a running site (default http://localhost:8788)
```

The test setup applies every migration with the real `wrangler d1 migrations apply` to a throwaway local D1,
then calls the API router with that binding. Coverage includes:

- invalid, malformed and revoked codes
- guests cannot read or change other households
- unknown or smuggled fields are rejected
- attendee limits are enforced on the server and inside the database write
- duplicate and stale submissions get `409`
- deadline and late-reply policy
- CSRF origin checks
- rate limits and account lockout
- every admin route rejects missing, forged, guest and expired sessions
- CSV export requires an admin and neutralises formulas
- cascading deletes
- re-applying migrations is a no-op
- database constraints

Mobile layout was checked manually by rendering the pages at 390 px and 1280–1440 px widths. There is no
automated visual test. After a deploy, check on a real phone.

## Deployment

### First time

1. **Create the production database** (requires `pnpm exec wrangler login`):
   ```bash
   pnpm exec wrangler d1 create wedding-db
   ```
   Copy the printed `database_id` into `wrangler.toml`, replacing the all-zero placeholder, and commit it.
   It's an identifier, not a secret.
2. **Apply migrations to production:** `pnpm db:migrate:remote`
3. **Create the Pages project**, connected to the GitHub repo: Cloudflare dashboard → Workers & Pages →
   Create → Pages → Connect to Git.
   - Build command: `pnpm build`
   - Build output directory: `dist`
   - Environment variable: `NODE_VERSION=22`

   The `DB` binding comes from `wrangler.toml`.
4. **Create the first admin:** `pnpm admin create <username> --remote`
5. **Verify:** `pnpm test:smoke https://<project>.pages.dev`, then sign in at `/admin`.

### Updates

Push to `main` and Cloudflare builds and deploys automatically. Pushes to other branches get preview URLs.
**Preview deployments use the same production D1 database** (one `database_id`), so don't test destructive
admin actions on previews.

### Production migrations

1. Add `migrations/000N_description.sql`. Never edit an applied migration. End each one with
   `INSERT INTO schema_migrations (version, name) VALUES (N, 'description');`.
2. Run `pnpm test` (it applies all migrations from scratch) and `pnpm db:migrate:local`.
3. Run `pnpm db:migrate:remote` **before** pushing code that depends on the change.
4. `/api/health` reports `schemaVersion`.

Backups: D1 Time Travel can restore the database to any point in the last 7 days (free plan):
`wrangler d1 time-travel restore wedding-db --timestamp=…`. For a longer history, export periodically with
`pnpm exec wrangler d1 export wedding-db --remote --output backup.sql`, and keep the file out of git.

## API access control

Every route and its access level is declared in one table in `server/router.ts`. The router checks
access before any handler runs.

| Access | Endpoints |
| --- | --- |
| **Public** | `GET /api/health` · `POST /api/invitation/session` (code → session; rate-limited) · `DELETE /api/invitation/session` · `POST /api/admin/login` (rate-limited, lockout) · `POST /api/admin/logout` |
| **Invitation session** (own household only) | `GET /api/invitation` · `PUT /api/invitation/rsvp` |
| **Administrator session** | `GET /api/admin/session` · `GET /api/admin/stats` · `GET/POST /api/admin/households` · `GET/PATCH/DELETE /api/admin/households/:id` · `POST/DELETE /api/admin/households/:id/invite-code` · `PUT/DELETE /api/admin/households/:id/rsvp` · `GET /api/admin/export.csv` |

No public endpoint lists guests. The `/admin` page itself is public, but it contains no data. All data
comes from admin-only endpoints.

## Security design

- **Invitation codes:** 60-bit random codes (`XXXX-XXXX-XXXX`, no ambiguous characters), stored only as
  SHA-256 hashes.
  - Links carry the code in the URL **fragment** (`#code=…`). Fragments are never sent to the server,
    access logs or `Referer`, and the page strips it from the address bar and history right away.
  - The code is exchanged for a **24-hour, HttpOnly session** limited to that household. Nothing is kept
    in localStorage.
- **Sessions:** guest sessions last 24 hours and admin sessions 12 hours. The cookie holds a random
  256-bit token, and D1 stores only its hash.
  - Cookies are `__Host-`prefixed, `Secure`, `HttpOnly` and `SameSite=Strict`.
  - Logout, password reset, code rotation and access revocation delete the matching sessions on the server.
- **CSRF:** SameSite=Strict cookies, plus an `Origin` check on every non-GET request, plus JSON-only
  bodies (`415` otherwise).
- **Brute force:** per-IP limits are stored in D1, keyed by hashed IP.
  - Invitation codes: 20 attempts per 15 minutes per IP.
  - Admin login: 10 attempts per 15 minutes per IP.
  - An admin account locks for 15 minutes after 10 consecutive failures.
  - The login response is the same whether or not the username exists.
- **Passwords:** PBKDF2-HMAC-SHA256 with 50,000 iterations.
  - Workers cap PBKDF2 at 100,000 iterations.
  - The free plan allows about 10 ms of CPU per request; 100k iterations measured about 12 ms on a laptop.
  - Generated passwords are long (about 130 bits), and the iteration count is stored in each hash so it
    can be raised later.
- **Input:** strict server-side validation rejects unknown fields, wrong types, oversize text and control
  characters. Bodies are capped at 16 KB. All SQL uses bound parameters.
- **RSVP integrity:** at most one response per household (primary key).
  - Updates carry a revision token (optimistic concurrency).
  - The seat limit is re-checked inside the write itself.
  - Writes are atomic D1 batches.
- **Output:** React escapes all rendered text. There's no `dangerouslySetInnerHTML`.
  - CSV cells starting with `= + - @` or tab are prefixed with `'` (formula injection).
  - Exports exclude codes, hashes and ids, and are served with `no-store`.
- **Headers:** enforced CSP (`script-src 'self'`, no third-party origins), `frame-ancestors 'none'`,
  `nosniff`, HSTS, `noindex`. API errors are generic codes, never stack traces.
- **Logging:** server logs contain error messages only, never request bodies or guest data.
- **Personal data:** names, seat counts, dietary notes and messages only. No emails, phone numbers or
  addresses are collected.

## Free-tier limits and long-term availability

Expected use (fewer than 100 households) is far below every limit. The following could still matter:

- **Workers/Pages Functions:** 100,000 API requests/day; static asset requests are free and unlimited.
  The CPU limit (about 10 ms per request) is why password hashing uses 50k iterations.
- **D1:** 5 GB storage, 5 million rows read and 100,000 rows written per day. An admin dashboard load
  reads every household (hundreds of rows), which is fine.
- **Pages builds:** 500 per month.
- **D1 Time Travel:** 7 days on the free plan. Export backups yourself if you want a longer history.
- **The `*.pages.dev` URL** stays as long as the project exists. Cloudflare can change free-tier terms;
  check the Workers/D1 pricing pages if the site must stay up for a long time.
- **Rate limiting** is per IP. Many guests behind one network (for example, venue Wi-Fi) share a budget of
  20 code attempts per 15 minutes. Valid links use one attempt each.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `/api/health` → `503` / `"database":"unavailable"` | Wrong `database_id` in `wrangler.toml`, or migrations not applied: `pnpm db:migrate:remote`. |
| `schemaVersion` lower than expected | Run `pnpm db:migrate:remote`. |
| Every API call returns `500` after a deploy | New code needs a migration that wasn't applied. Apply it (step 3 above). |
| Admin login: "Too many sign-in attempts" | Wait 15 min, or `pnpm admin reset-password <user> --remote` (clears the lockout). |
| Login fails with Cloudflare error 1102 (CPU limit) | Reset the password; if it persists, lower `ITERATIONS` in `scripts/admin.mjs` and `server/crypto.ts`. |
| Guest says their link doesn't work | It may have been regenerated or revoked: **Issue new code** and resend. |
| `403 forbidden` on saves locally | Use the same origin the API runs on (`:8788`, or `:3000` through the Vite proxy). |
| Cookies not kept locally | Use `http://localhost`. Plain-HTTP dev uses non-`__Host-` cookies by design. |
| `pnpm: command not found` | `corepack enable`, or prefix commands with `corepack pnpm`. |
