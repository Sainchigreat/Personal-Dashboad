# Momentum OS — Netlify deployment stage

**Date:** 2 November 2026
**Branch:** `arena/0d207c00-personal-dashboad`
**Commit:** `c0fcbf7b2d754dcd6f1882fe74cfb4bf6318be92` (`c0fcbf7`) plus this deployment-readiness change
**Budget:** ₦0 — Netlify free tier + the existing Supabase free project. No paid infrastructure introduced.

---

## 1. Honest status: why there is no Netlify URL yet

A real Netlify deployment **could not be created from this sandbox**. This is not a
code problem; every part of the app is built and tested. The blockers are access
and network:

| Check | Result |
| --- | --- |
| Netlify connector in Arena | `unsupported` — no Netlify tools are available |
| `NETLIFY_AUTH_TOKEN` / `NETLIFY_SITE_ID` in the environment | **absent** (names checked, values never read) |
| Netlify CLI / auth state | no CLI, no `~/.netlify`, no `.netlify/` state |
| GitHub deployments API | `[]` — zero deployments |
| GitHub environments API | `total_count: 0` |
| PR #4 checks | only `verify` (GitHub Actions); no Netlify preview check |
| Repo homepage / Netlify URL in any ref | none |
| `npx netlify deploy` (normal) | `Error: Authentication required. NETLIFY_AUTH_TOKEN is not set` |
| `npx netlify deploy --allow-anonymous` with functions | `This project includes serverless functions which require authentication` |
| `npx netlify deploy --allow-anonymous` static-only | `Deploying 76 files anonymously... TypeError: fetch failed` |
| `curl https://api.netlify.com/api/v1/sites` | `SSL_ERROR_SYSCALL` (HTTP 000) — **network blocked** |
| `node fetch('https://api.netlify.com/...')` | `ECONNRESET` |

The sandbox permits outbound traffic only to GitHub, npm and PyPI hosts.
`api.netlify.com` is unreachable, so even an anonymous static deploy cannot be
uploaded. **I will not invent or guess a Netlify URL** — the several
`*.netlify.app` sites found by web search belong to unrelated projects.

What *is* available right now: a **local production-build preview** of the exact
`dist/` Netlify would publish (port 4173), plus the full dev preview (port 5173 /
API 3001). Both are live in this session.

---

## 2. Branch and build verification

- `git rev-parse HEAD` → `c0fcbf7b2d754dcd6f1882fe74cfb4bf6318be92`
- `origin/arena/0d207c00-personal-dashboad` → same commit (branch is pushed)
- Backend conversion commits present: `f430d9b` (async Express→PostgreSQL),
  `d428730` (safe Supabase connection), `414efd2` (Supabase backend)
- `npm run build` → ✅ `tsc --noEmit` clean, Vite build clean, `dist/index.html`
  + `dist/assets/*` produced. Only the non-failing >500 kB chunk advisory.
- `npm test` → ✅ 14 files / 65 tests (see §7)
- CI on the branch: green

### `netlify.toml` (verified)

```toml
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"

[build.environment]
  NODE_VERSION = "22"
  NPM_FLAGS = "--no-audit --no-fund"

[functions]
  node_bundler = "esbuild"
  external_node_modules = ["express", "express-async-errors"]

[[redirects]]                       # MUST come before the SPA fallback
  from = "/api/*"
  to = "/.netlify/functions/api/:splat"
  status = 200
  force = true

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

`external_node_modules` follows Netlify's official Express guidance and keeps
`express` (and the async-error patch that reaches into `express/lib/router`) as
the same runtime module instance. A `[dev]` block makes `netlify dev` mirror the
deployed redirects locally.

---

## 3. Function and routing (verified)

`netlify/functions/api.ts`:

- Exports `handler` from `serverless-http(app)`; sets `MOMENTUM_IMPORT_ONLY=1`
  so importing the Express app never calls `app.listen()`.
- **Fails closed with 503** when `DATABASE_URL` is absent — otherwise the app
  would silently use an ephemeral SQLite file and lose data on cold starts.
- `normalizeEvent()` maps both redirect path shapes back to `/api/*`: Netlify may
  surface either the original `/api/auth/status` or the rewritten
  `/.netlify/functions/api/auth/status`. It also fills the fields
  `serverless-http`'s AWS provider expects (`body`, `headers`,
  `requestContext`, `requestPath`, `rawPath`).
- `server/db.ts` loads `node:sqlite` **lazily**, so the deployed PostgreSQL path
  never imports a built-in that older Node 22 runtimes may lack.

`tests/netlify-function.test.ts` calls the real handler with Netlify-shaped
events and a real PostgreSQL engine (PGlite) behind a mocked `pg`: both path
shapes, 503 fail-closed, `/api/pg/health` round trip, registration, CSRF
rejection, write persistence and retrieval — **8/8 pass**.

---

## 4. Exact environment variables (names only — no values)

### Required — server-only secret

| Name | Value | Where |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string for the **existing** Supabase project `Momentum` (ref `ppfjotymclhbihkjvyxt`, region `eu-west-2`, host `db.ppfjotymclhbihkjvyxt.supabase.co`, PostgreSQL 17.11). Use the **pooled** connection string from Supabase Dashboard → **Connect** → **Connection string** → **Transaction pooler** (port `6543`) for serverless. Format: `postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres`. URL-encode the password if it contains special characters. | Netlify → Site configuration → Environment variables. **Scope: Functions + builds.** |

`DATABASE_URL` is the single variable that decides whether the API is real.
Without it, every `/api/*` call returns **503**. It must **never** be prefixed
with `VITE_`, never logged, never committed, never placed in client code.

### Required — public build-time values (not secrets)

| Name | Value | Where |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `https://ppfjotymclhbihkjvyxt.supabase.co` | Netlify build environment. Vite **bakes these into `dist/` at build time**, so they must exist before `npm run build` runs. |
| `VITE_SUPABASE_ANON_KEY` | the project's **publishable** key (`sb_publishable_…`) | same. Never use a service-role or secret key here. |

### Optional / automatic

| Name | Purpose |
| --- | --- |
| `NODE_ENV` | `production` — Netlify sets this for production builds; enables Secure cookies and CSP. |
| `PG_POOL_MAX` | Server-only, default `5`. Keep low (3–5) for serverless cold starts. |
| `DATA_DIR` | Optional scratch path; the wrapper defaults it to `/tmp/momentum-data`. Not used when PostgreSQL is active. |
| `MOMENTUM_IMPORT_ONLY` | Set **by the wrapper**, not by you. Stops `app.listen()` on import. |
| `MOMENTUM_PREVIEW` | Must **not** be `1` on a real deployment (that enables unauthenticated demo sign-in). |
| `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID` | Only needed if you deploy from the CLI/CI instead of the Netlify UI. Names only — never commit values. |

**Never needed:** `SUPABASE_SERVICE_ROLE_KEY`, database password in a separate
var, JWT secret, or any other secret for the browser.

---

## 5. Secret-safety rules (followed here)

- No connection string, password, service-role key or token is in Git.
- `.env.example` documents **names and placeholders only**; `.env.local` is
  gitignored and contains publishable values only.
- The wrapper returns the *name* `DATABASE_URL` in its 503 message, never a value.
- Verification scripts never print cookies, CSRF tokens or connection strings.
- `git grep` for `postgres://`, `postgresql://` and `DATABASE_URL=\S` finds no
  committed values.

---

## 6. Deploy commands (run these where Netlify is reachable)

Once you either connect the repo in the Netlify UI or provide a token, this
branch is ready as-is:

```bash
# One-time: link the repo to a Netlify site (interactive, needs your Netlify login)
npx netlify init

# Preview deploy (does NOT touch production; gives a deploy-preview URL)
npx netlify deploy --build

# Or deploy the already-built artifacts
npm run build
npx netlify deploy --dir=dist --functions=netlify/functions

# Production only after verification
npx netlify deploy --prod
```

In the Netlify UI, set these before the first build:
**Site configuration → Environment variables →** `DATABASE_URL`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Then trigger a deploy of branch
`arena/0d207c00-personal-dashboad` (or merge PR #4 first, only with your
approval).

---

## 7. Verification performed here (no deployed site available)

| Check | Result |
| --- | --- |
| `npm run build` | ✅ production `dist/` produced |
| `npm test` | ✅ 14 files / 65 tests pass |
| `tests/netlify-function.test.ts` | ✅ 8/8 — handler, both redirect path shapes, fail-closed 503, health round trip, auth, CSRF, persistence, retrieval |
| `tests/postgres-integration.test.ts` | ✅ 10/10 — full Express API on a real PostgreSQL engine |
| `tests/postgres.test.ts`, `tests/pg-health.test.ts` | ✅ translation + fail-closed health |
| `node scripts/verify-netlify.mjs --url http://127.0.0.1:4173` | 4 PASS / 1 WARN — frontend HTML, SPA fallback, auth status, unauthenticated `/api/bootstrap` → 401; `/api/pg/health` → **503 because `DATABASE_URL` is not set** |
| Live Supabase Edge Function `/health` | ✅ `{"status":"ok","tables":30,...,"checked_at":"2026-11-02T08:50:12Z"}` |
| Live Supabase DB state | 30 `public` tables / **0 rows**, 29 `momentum_os` tables, 4 migrations, 41 policies — **nothing deleted, no new project** |
| `node:sqlite` lazy load | ✅ PostgreSQL path no longer imports it at module load |

### Post-deploy verification (once you have the URL)

```bash
# Read-only smoke test
npm run verify:netlify -- --url https://YOUR-SITE.netlify.app

# Full auth + write/read acceptance (creates the first owner and ONE test task;
# refuses to run if an owner already exists, never deletes anything)
npm run verify:netlify -- --url https://YOUR-SITE.netlify.app --acceptance

# From a machine with database access
npm run verify:db
```

Expect `/api/pg/health` to return HTTP 200 with a `roundTrip.id` once
`DATABASE_URL` is correctly configured; HTTP 503 means the integration is still
outstanding.

---

## 8. Outstanding integration issue

**The deployed Netlify Function's connection to Supabase has not been verified**
because no deployment exists yet and `api.netlify.com` is unreachable from this
sandbox. Specifically unverified on a real Netlify domain: cold-start `pg` pool
behaviour, HTTPS `Secure` cookies / `SameSite=Lax`, CSRF round trips, the
`X-Forwarded-*` / trust-proxy setup, and end-to-end write/read persistence.

Everything else is ready. The frontend preview remains available locally on
ports 4173 (`dist/` production build) and 5173 (dev preview with demo data).

---

## 9. Exact next actions to make Momentum OS production-ready

1. **Give me the Netlify site URL / site ID** (or connect Netlify in Arena / set
   `NETLIFY_AUTH_TOKEN` + `NETLIFY_SITE_ID` in the host). Then I can deploy a
   preview from this branch and report the real URL.
2. **Set `DATABASE_URL`** in Netlify → Site configuration → Environment
   variables, scoped to Functions, using the pooled connection string from the
   existing `Momentum` project. **Do not paste it into chat or Git.**
3. **Set the two public `VITE_` values** in the Netlify build environment, then
   redeploy (they are baked at build time).
4. **Run `npm run verify:netlify -- --url <URL> --acceptance`** and paste me the
   output; I will fix anything it flags. Confirm `/api/pg/health` returns 200
   with a real `roundTrip`.
5. **Create the owner account** through the deployed app, then disable public
   signup, configure SMTP, set the correct `site_url` and redirect allow list.
6. **Only then** merge PR #4 into `main` and redeploy production; re-run the
   verification against the production URL.

No step above requires a new Supabase project, deleting data, an auth redesign,
or paid infrastructure.
