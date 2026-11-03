# Momentum OS — personal plan corrections and platform audit

**Date:** 3 November 2026
**Branch:** `arena/5d4e0afa-personal-dashboad`

## 1. Audit findings (before changes)

| Area | Problem found |
| --- | --- |
| Authentication UI | `src/pages/Auth.tsx` showed **"Welcome back" / Sign in only** whenever any user existed. Account creation appeared only on a brand-new deployment (`needsSetup=true`). New visitors could not register. |
| Server registration | `POST /api/auth/register` allowed only the first account or an invitation. A second visitor got `403 "A team invitation is required"`. |
| Global defaults | `createWorkspace()` seeded **Chisom's** course (`Graphic Design with AI`, ₦14,900), an active November cycle (68 / ₦1,013,200 / 20) and his daily routine into **every** new account. |
| Supabase Auth defaults | `public.handle_new_user()` seeded the same course, 68-seat cycle, personal routine and 5/6/8 AM job batches for every new Auth user; `public.ensure_daily_plan()` added Chisom's weekday schedule to everyone. |
| Prospecting workflow | Routine contained "Research 10 new/emerging businesses and 10 established businesses" — manual research is **not** Chisom's job; research is delivered by the separate prospect-research system as a daily report. |
| Obsolete work | Live owner's `todo` tasks included six 5/6/8 AM job-search batch tasks (2 generated days × 3) plus a generic "Creative Project 1" task. |
| Publishing | A generic "Publish one useful piece of content today" task coexisted with the fixed Monday–Sunday calendar. |
| Goals | Live owner had 3 generic monthly goals and 7 weekly goals; `Cartridge`, `Next Chapter` and `Client acquisition` were missing. |
| Speaker register | Missing explicit `reminder_status` and `asset_approval_status`. |
| Live accounts | Two owner accounts exist. `6d8e45af-…` (`sainchigreat00@gmail.com`) holds Chisom's plan; `d4649427-…` has settings only (clean). Both preserved. |

## 2. Changes made

### Platform-wide authentication
- `src/pages/Auth.tsx`: always-visible **Sign in / Create account** tabs, name field on sign-up, 12-character password validation, error + success feedback, mobile/desktop CSS. Invitation flow unchanged.
- `server/index.ts`: any new email may create an independent workspace; duplicate email → `409 "This email already has an account. Please sign in."`; first-account and invitation paths preserved (invite duplicates still validated through the token).
- `server/db.ts` `createWorkspace()`: clean workspace — no course, no 68-seat targets, no routine; a neutral current-month cycle with zero targets keeps the UI usable.
- `supabase/migrations/20261102000600_personal_plan_scoping.sql`: `handle_new_user` and `ensure_daily_plan` replaced with clean, per-owner-only defaults. No existing rows changed.

### Chisom's personal plan (scoped, never global)
- `server/personalPlan.ts`: single source of truth for the routine, fixed Monday–Sunday publishing calendar, weekday execution plan, five monthly goals and eleven November 2–8 weekly outcomes.
- `server/db.ts`: `isPersonalOwner()` resolves by `MOMENTUM_PERSONAL_OWNER_EMAIL` (server-only env) or the additive `personal_plan_owner` marker table. `ensureDailyPlan()` applies the personal plan **only** to that owner; other accounts generate solely from their own templates.
- Obsolete titles are reconciled out of every active recurring plan; no job batches, no manual "research 20 businesses", no generic publishing task.
- Daily deliverables link to weekly goals via `tasks.weekly_goal_id`. Sales, publishing and project progress remain record-based; activity goals count linked completed tasks once.
- Distinct Creative Studio / Brand Identity project tracks; Thursday YouTube publish + distribute; Sunday full weekly review, writing and next-week plan.
- `src/pages/Speakers.tsx` + schema/validation/types: `reminder_status` and `asset_approval_status`.
- `scripts/reconcile-personal-plan.ts` (`npm run reconcile:personal`): owner-id required, dry-run default, `--apply` to write, idempotent, cancels obsolete `todo` work without deleting rows and fills correct plans for generated days.
- `scripts/build-personal-reconcile-sql.ts` generates versioned `supabase/migrations/20261102000700_personal_owner_reconcile.sql` from the plan data.

## 3. Live Supabase `Momentum` reconciliation (applied, additive)

Versioned migrations applied: `personal_plan_scoping`, `personal_owner_reconcile` → **7 migrations** total. Verified after application:

| Metric | Value |
| --- | --- |
| `public` rows | 0 (unchanged) |
| active monthly goals | **5** (3 superseded rows archived, not deleted) |
| active weekly goals | **11** (4 superseded rows archived) |
| tasks | 45 total: 35 `todo`, 10 `cancelled`, **0 completed** |
| active 5/6/8 AM job batches | **0** |
| active manual "research" tasks | **0** |
| linked daily deliverables | 25 |
| cycle | 68 sales / ₦1,000,000 revenue / 20 outreach |
| sales / weekly reviews | 0 / 0 (nothing fabricated) |
| other owner accounts | 1, clean, untouched |

The second account and all completed/historical rows are preserved. No DROP / TRUNCATE / DELETE was used; rollback notes are in the migration files.

## 4. Verification (local)

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | ✅ |
| `npm run build` | ✅ |
| `npm test` | ✅ **20 files / 106 tests** |
| `tests/auth-signup.test.ts` (8) | §3F checks 1–9: sign-up screen, creation, clean workspace, sign-in switch, duplicate email, invitations, cross-account isolation, logout/re-login |
| `tests/planner.test.ts` (8) | clean accounts, owner scoping, five monthly + eleven weekly goals, Monday–Sunday correct day-specific plans, no obsolete tasks, no duplicates, task→goal links, idempotent reconciliation, guest reminder, carry-forward |
| `tests/goal-progress.test.ts` (12) | paid-only sales, realised revenue, publishing, outreach vs replies/calls, project stages, task dedupe, no fabrication, task completion updates only the matching goal |
| `tests/goal-migration.test.ts` (2) | PostgreSQL migration re-run safety, neutralised defaults, reconciliation idempotency on PGlite |
| `npm run build:preview` | ✅ |
| Netlify-style CJS Function bundle | ✅ exits 0 |

## 5. What is intentionally NOT done / unverified

- The **prospect-research system and its delivery configuration are external to this repository**; nothing here was duplicated, changed or reconfigured. Chisom's task is to review its daily report.
- **Cartridge**: no recurring activities were invented. The monthly goal exists and points to existing project notes/workspace; the brief explicitly says to check those notes first.
- **Revenue target**: brief states ₦1,000,000; 68 × ₦14,900 = ₦1,013,200. The cycle now uses the stated ₦1,000,000, with the arithmetic recorded in the monthly goal notes in `server/personalPlan.ts`.
- Multi-user **Sign up** is now open as required; if you later want invite-only registration, that needs an explicit product decision (do not make the platform private).
- A full authenticated smoke test on the live Netlify site needs Chisom's session; the read-only endpoints and unauthenticated boundary were verified.
- Remaining known gaps from earlier work (multi-team membership per user, RLS on `momentum_os`, two-team QA matrix, device/a11y audit) are unchanged; see `docs/GOAL-HIERARCHY.md` §4.
