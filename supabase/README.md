# Momentum AI — Supabase backend

The live backend for **Momentum OS / Momentum AI**. It is designed as the cloud
successor to the single-instance SQLite adapter in `server/db.ts`.

## What is deployed

| Layer | Where | Details |
| --- | --- | --- |
| Database | Postgres 17 (`public`) | 30 tables: personal workspace, shared team workspace, and the Momentum AI layer |
| Security | Row Level Security | 41 policies. Owner-only personal rows; active team membership for shared rows; `anon` has no table privileges |
| Identity | Supabase Auth (GoTrue) | `auth.users` + `public.profiles`. Passwords, sessions and recovery are handled by GoTrue, not application code |
| RPC | Postgres functions | `momentum_health`, `workspace_bootstrap`, `command_centre`, `ensure_daily_plan`, `generate_ai_suggestions` |
| Views | `security_invoker` | `v_open_tasks`, `v_sales_summary`, `v_ai_inbox` |
| HTTP API | Edge Function `momentum-api` | CORS-enabled REST at `/functions/v1/momentum-api`, verifies the caller JWT and runs every query as that user |
| Automation | Triggers | `handle_new_user` seeds a new owner workspace; `set_updated_at` maintains timestamps; `log_activity` writes an audit trail |

Migrations live in `supabase/migrations/` and are applied in order. They are
idempotent and additive — re-running them does not delete records.

## Data model

- **Personal:** `profiles`, `settings`, `cycles`, `products`, `projects`,
  `chapter_sessions`, `tasks`, `generated_days`, `sales`, `leads`, `campaigns`,
  `promotions`, `prospects`, `interactions`, `jobs`, `content_items`,
  `session_checklists`, `daily_notes`, `weekly_reviews`.
- **Shared team:** `team_workspaces`, `team_members`, `team_invites`,
  `team_goals`, `team_tasks`, `team_comments`, `team_activity`.
- **Momentum AI:** `ai_runs`, `ai_suggestions`, `ai_daily_briefs`,
  `activity_events`.

Every `user_id` is a `uuid` referencing `auth.users(id)` with
`on delete cascade`. Timestamps are `timestamptz`; calendar fields stay as
`YYYY-MM-DD` text so the existing UI types keep working.

### New account bootstrap

`handle_new_user()` runs after insert on `auth.users`. For an `owner` it creates
the profile, settings (Africa/Lagos, 08:00–17:00, light theme, editable
recurring plan), the *Graphic Design with AI* product at ₦14,900, the active
monthly cycle (68 sales / ₦1,013,200 / 20 daily outreach / 2 projects / 2
Next Chapter pieces), and an isolated team workspace. Accounts created with
`account_type: "team"` metadata receive **no** personal records.

## HTTP API

Base: `https://<project-ref>.supabase.co/functions/v1/momentum-api`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | public | Metadata only: table/policy/function counts |
| GET | `/me` | JWT | Caller identity |
| GET | `/bootstrap` | JWT | All personal records as one JSON payload |
| GET | `/metrics?month=YYYY-MM` | JWT | Command Centre metrics from real records |
| POST | `/planner/ensure` | JWT | Generate today's editable plan once |
| POST | `/ai/brief` | JWT | Generate suggestions + daily brief |
| GET | `/ai/suggestions` | JWT | Suggestion history |
| GET | `/resources` | JWT | Writable resource list |
| GET/POST | `/:resource` | JWT | List or create (whitelisted tables) |
| PATCH/DELETE | `/:resource/:id` | JWT | Update or delete a row |

All data endpoints construct a Supabase client **with the caller's own JWT**, so
Postgres RLS is the final authorization boundary. Ownership columns (`user_id`,
`created_by`, `actor_user_id`) are forced server-side and cannot be supplied by
a client. The service-role key is never used by browser code.

## Frontend integration

`src/lib/cloud.ts` holds the browser client and typed API helpers. The app's
**Momentum Cloud** page (`src/pages/Cloud.tsx`) shows the live health check,
lets the owner create an account or sign in, and reads metrics, the planner,
the daily brief and the AI inbox straight from Supabase.

Configure `.env.local` (gitignored):

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable key>
```

The publishable key is intentionally public; RLS and JWT verification protect
the data. Never prefix a secret key with `VITE_`.

## Honest limits

- The AI layer is **rules-based** (`rules-v1`), not an LLM. It reads real sales,
  tasks, follow-ups and sessions and suggests next actions. No external model
  is called and no completed work, sale or outreach is fabricated. Swap
  `generate_ai_suggestions()` for a model-backed job when an API key exists.
- The existing React pages still use the local Express/SQLite API. Switching
  them to the cloud adapter is the next integration step (see root README).
- Team workflow transitions (submit → review → approve) are enforced by the
  Edge Function and RLS for the shared tables; the local Express team API
  remains the reference implementation for the full review workflow.
- Email confirmation is auto-confirmed on this project so the first owner can
  sign up without SMTP. Configure SMTP and disable public signup after creating
  the owner account if this becomes a private, single-owner deployment.
- Scheduled jobs (e.g. generating each day's plan at midnight Lagos time) need
  a cron trigger; call `/planner/ensure` from the app or a scheduler for now.
