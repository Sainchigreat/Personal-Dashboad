# Supabase project audit & safe connection record

**Date:** 2 November 2026 · **Repository:** `Sainchigreat/Personal-Dashboad` · **Branch:** `arena/0d207c00-personal-dashboad`
**Reference:** `Momentum_OS_Supabase_Arena_Implementation_Spec.pdf` (sections 2, 4, 7, 10, 11)

## 1. Exact project identified

| Field | Value |
| --- | --- |
| Project name | **Momentum** |
| Project ref | `ppfjotymclhbihkjvyxt` |
| Region | `eu-west-2` |
| Status | `ACTIVE_HEALTHY` |
| Database | PostgreSQL 17.11 (`db.ppfjotymclhbihkjvyxt.supabase.co`) |
| Services | auth, db, pooler, pg_bouncer, rest, storage — all healthy |
| Created | 2026-11-02T00:45:51Z |

Only **one** project is visible to the connected Supabase credential. No second account/project could be inspected. **No new Supabase project was created** (`list_projects` returns exactly this one).

## 2. What already existed BEFORE this turn

| Object | Count | Detail |
| --- | --- | --- |
| `public` tables | **30** | personal, shared-team and Momentum AI tables; all with RLS enabled |
| Rows in `public` | **0** | verified with an exact `count(*)` over every table |
| Versioned migrations | **3** | `momentum_core_schema`, `momentum_rls`, `momentum_api` |
| RLS policies | 41 | owner-only personal rows; team membership/role policies |
| SQL functions | 12 | health, bootstrap, metrics, planner, AI brief, helpers, triggers |
| Views | 3 | `v_open_tasks`, `v_sales_summary`, `v_ai_inbox` |
| Triggers | 30 in `public` + 1 on `auth.users` | timestamps, signup bootstrap, audit trail |
| Foreign keys / indexes | 56 / 52 | |
| Edge Function | 1 | `momentum-api`, status `ACTIVE`, `verify_jwt=false` (auth inside the function) |
| Auth users / identities | 0 / 0 | |
| Storage buckets | 0 | |
| Injected secrets | 7 | names only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`, `SUPABASE_DB_URL`, `SUPABASE_JWKS` |

Auth config: email signup enabled, `mailer_autoconfirm=true`, JWT expiry 3600s, refresh-token rotation on. No secret values are repeated anywhere in this repository.

**Local SQLite data:** none. The `data/` directory does not exist in this checkout (`data/workspace` and `data/preview` absent). Per spec §7, there is **no production SQLite data to back up or import**; the schema and test-seed strategy are preserved by the migrations instead.

**Conclusion:** there was no existing data to lose, so no backup/restore was required, and no destructive operation was justified.

## 3. Changes made this turn (all additive)

One new **versioned migration** on the SAME project: `20261102000400_momentum_os_compat.sql` → recorded as `momentum_os_compat` in `supabase_migrations.schema_migrations` (now 4 migrations).

- Creates schema `momentum_os` (new, no existing object touched).
- Translates **the complete `server/schema.sql`** into PostgreSQL: 28 tables with the exact original names, TEXT UUID ids, columns, defaults, checks, uniqueness, foreign keys (52), `ON DELETE CASCADE` / `SET NULL` behaviour, and all 9 original indexes.
- Preserves the two tables the pre-existing `public` schema lacked — `users` and `auth_sessions` — so the Express API's **custom bcrypt passwords, hashed opaque session tokens, HttpOnly cookies and CSRF** can be kept (spec §3).
- Deliberate type decisions: `REAL` → `double precision`; `INTEGER` flags stay `integer` (0/1) to match the existing TypeScript types; `expires_at` → `bigint` because it stores epoch milliseconds; `TEXT` timestamps stay `text` ISO strings.
- Adds `momentum_os.integration_checks`, a metadata-only table for connection evidence.
- All DDL uses `CREATE SCHEMA/TABLE/INDEX IF NOT EXISTS`. **No DROP, TRUNCATE, DELETE, ALTER TABLE, rename, or overwrite.**

After the migration: `public` still 30 tables / **0 rows**; `momentum_os` 29 tables / 52 FKs / 47 indexes.

### Architecture reconciliation (important)

The spec (§3) asks to keep the Express API and custom auth and connect via `DATABASE_URL`/`pg`. The pre-existing `public` schema, however, is built on **Supabase Auth** (`auth.users`), `uuid` columns and RLS. Replacing it with the legacy schema would have required dropping or rewriting existing tables — explicitly prohibited by the spec (§2) and by the user's "no unnecessary data deletion".

Therefore the two schemas **coexist**: `public` remains the live Supabase Auth / RLS / Edge Function backend (unchanged), and `momentum_os` is the exact legacy-compatible PostgreSQL home for the Express/Netlify path. **No authentication redesign was applied**: the Express API keeps its own auth; Supabase Auth is not introduced into it.

## 4. Real connection / persistence proof

A real server-side write and a **separate** read against the live project:

1. `INSERT INTO momentum_os.integration_checks (id, label, payload) VALUES ('arena-connection-20261102', ...)` in one request → returned the row.
2. A **different** request did `SELECT id, label, payload, created_at ... WHERE id='arena-connection-20261102'` → returned the same row and payload, plus `public_tables=30`, `public_rows=0`, `compat_tables=29`, `compat_foreign_keys=52`, `migrations=4`.

That is a genuine write/read persistence round trip across connections, with nothing deleted. Earlier end-to-end SQL smoke tests (signup trigger, daily planner, AI brief, bootstrap, metrics, RLS isolation for owner vs team account) were run inside transactions that were rolled back, so they left no data.

## 5. Code added

| File | Purpose |
| --- | --- |
| `supabase/migrations/20261102000400_momentum_os_compat.sql` | versioned, additive full-schema translation |
| `server/postgres.ts` | server-only `pg` pool, `?`→`$n` translation, `INSERT OR IGNORE`→`ON CONFLICT DO NOTHING`, `BEGIN IMMEDIATE`→`BEGIN`, schema qualification, error normalisation, transactions, `checkPostgresConnection()` round trip |
| `scripts/verify-db.ts` | `npm run verify:db` — real DB round trip from a machine with DB access |
| `scripts/import-sqlite.ts` | `npm run import:sqlite` — repeatable FK-safe import, `ON CONFLICT DO NOTHING`, row-count report, never deletes |
| `tests/postgres.test.ts` | unit tests for the translation layer |
| `tests/postgres-integration.test.ts` | 10 acceptance tests running the real Express app against a real PostgreSQL engine (PGlite) with `pg` mocked — auth, CSRF, isolation, idempotent planner, atomic rollover/checklists, write/read persistence, export redaction, session survival |
| `netlify.toml` | build/publish/functions, `/api/*` redirect before SPA fallback, security headers |
| `netlify/functions/api.ts` | Netlify Functions entry point; serves the async PostgreSQL API (fails closed only when `DATABASE_URL` is missing) |
| `server/index.ts`, `server/team.ts`, `server/db.ts` | fully converted to `await`ed queries; `db` selects SQLite locally or `momentum_os`/`pg` when `DATABASE_URL` is set |
| `server/express-async-errors.d.ts` | side-effect patch so Express 4 forwards rejected async handlers to the error middleware |

## 5b. Async conversion (completed)

Every `db.prepare(...).get/all/run` and `db.exec(...)` call in `server/db.ts`, `server/index.ts` and `server/team.ts` is now awaited; all affected helpers, middleware and route handlers are `async`. The `db` object exposes one async `Statement` API with two backends:

- **SQLite** (no `DATABASE_URL`): local preview, development and the existing test suite. Keeps the additive SQLite migrations, custom bcrypt/cookie/CSRF auth and exact behaviour.
- **PostgreSQL** (`DATABASE_URL` set): queries are translated by `server/postgres.ts` (`?`→`$n`, `INSERT OR IGNORE`→`ON CONFLICT DO NOTHING`, `BEGIN IMMEDIATE`→`BEGIN`, `COUNT(*)::int`, `momentum_os.` qualification, `23505`/`23503` error mapping) and executed on the pooled connection.

`withDbContext` installs a per-request `AsyncLocalStorage` transaction state, so `BEGIN` / `COMMIT` / `ROLLBACK` keep the original transaction boundaries on a single pooled client (with automatic rollback/release if a response finishes with a transaction open). `forEach` insert loops became awaited `for...of` loops. API response shapes, Zod validation, ownership scoping, role checks, invite expiry, CSRF and export redaction were preserved.

**Verification:** 10/10 acceptance tests pass against a real PostgreSQL engine — registration + seeded defaults, CSRF rejection, idempotent daily plan, write/read persistence across requests, atomic Next Chapter checklists, atomic cycle rollover with duplicate rejection, credential-free export, team-account isolation from owner data, and data survival across logout/login. 47 existing SQLite-mode tests still pass.

## 6. Environment variable NAMES only (no values)

| Name | Where | Exposure |
| --- | --- | --- |
| `DATABASE_URL` | Netlify → Site configuration → Environment variables; local `.env.local` | **server-only secret** — never `VITE_`, never committed |
| `PG_POOL_MAX` | same | server-only, optional (default 5, serverless-safe) |
| `MOMENTUM_IMPORT_ONLY` | set by the Netlify wrapper | server-only, stops `app.listen()` on import |
| `DATA_DIR`, `NODE_ENV`, `PORT` | same | server-only |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `.env.local` / Netlify | public publishable values only |

## 7. Evidence-based status

| Item | Status | Evidence |
| --- | --- | --- |
| Exact existing project identified | ✅ | §1 of this document |
| Existing schema / migrations / data inspected | ✅ | §2, live `information_schema` + exact row counts |
| No unnecessary data deletion | ✅ | 0 rows before, 0 rows in `public` after; no destructive SQL |
| No new Supabase project | ✅ | `list_projects` returns one project |
| Versioned PostgreSQL migration | ✅ | 4th migration recorded; `supabase/migrations/` in Git |
| Database connected (real write/read round trip) | ✅ | §4, two separate server-side requests |
| Build / type-check | ✅ | `npm run build` — `tsc --noEmit` + Vite build clean; `dist/` production output verified |
| Automated tests | ✅ | `npm test` — 14 files / 65 tests pass (47 SQLite-mode + 10 PostgreSQL acceptance + 8 Netlify Function tests) |
| Netlify build config + Function routing | ✅ | `netlify.toml` verified; `normalizeEvent()` handles both `/api/*` and `/.netlify/functions/api/*` shapes; `tests/netlify-function.test.ts` 8/8 |
| Deploy verification script | ✅ | `npm run verify:netlify -- --url <URL>` — read-only smoke + opt-in write/read acceptance; local production-build preview returns 4 PASS / 1 WARN |
| Express routes converted to async PostgreSQL | ✅ | §5b, all three server files awaited; verified against a real PostgreSQL engine |
| Netlify Functions entry point ready | ✅ | wrapper serves the async app whenever `DATABASE_URL` is set; fails closed only when the secret is missing |
| Site deployed & API health verified on Netlify | ❌ **not verified** | no Netlify connector, token, site ID, deployed URL or reachable Netlify API from this sandbox. The CLI fails with `Authentication required` and the anonymous deploy fails with `TypeError: fetch failed` (`api.netlify.com` unreachable). See `docs/NETLIFY-DEPLOYMENT.md` |

> This sandbox permits outbound traffic only to GitHub/npm/PyPI hosts, so neither a live `pg` connection from Node nor a Netlify upload can be opened here. The async path was verified against an in-process real PostgreSQL engine (PGlite) using the exact `momentum_os` migration, the Netlify Function handler was exercised with Netlify-shaped events, translated SQL was executed server-side on the live Supabase database, and the live Edge Function `/health` still returns `status: ok`. What is still NOT proven is a deployed Netlify function reaching Supabase over the network — that requires `DATABASE_URL` in Netlify and a deployed URL. A local production-build preview of `dist/` remains available.
