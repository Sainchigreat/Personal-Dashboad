# Momentum OS — implementation blueprint status

**Date:** 2 November 2026
**Branch:** `arena/b038e448-personal-dashboad`
**Status:** PR #7 was merged on 3 November 2026 (merge commit `49ae355`) and published to Netlify. Chisom's personal-plan corrections subsequently landed via PR #9 (`06f9b2f`); see `docs/PERSONAL-PLAN-CORRECTIONS.md` for the current state.

---

## 1. What was implemented

### Phase 1 — PR #6 reconciled onto `main`
PR #6's 15 commits targeted the stale `arena/0d207c00-personal-dashboad` branch (already merged via PR #4). Its useful content was brought onto this branch without switching or pushing to any other branch: reconciled November routine, retired 05/06/08 batch removal, weekday Nov 2–8 execution tasks, Weekly Goals nav, existing 68 / ₦1,013,200 / ₦14,900 targets. `main`'s async-IIFE CJS fix (`93a48bd`) was retained; PR #6's duplicate `server/index.ts` patch discarded. Its only CI failure (YouTube tutorial expected Tuesday, due Thursday) was fixed.

**Safeguards enforced:** removed the `NODE_ENV=production` plan seed (it would have seeded Chisom's plan into every new account), removed the owner-specific starter-goal fallback in the UI, and guarded progress sources so record-backed goals never count task checkboxes.

> Correction: earlier I reported `Promise` / `Partial` type errors in PR #6. That was a GitHub API markdown HTML-stripping artefact; the source uses `Promise<void>` and `Partial<Goal>`. Its only failure was the weekday mismatch.

### Phase 2 — additive goal hierarchy + owner-only backfill
- `monthly_goals`, `weekly_goals`, `goal_links`, `tasks.weekly_goal_id` in `server/schema.sql`, the additive SQLite migration in `server/db.ts`, and versioned `supabase/migrations/20261102000500_goal_hierarchy.sql`.
- FKs, indexes (workspace, owner, date range, parent, assignee, status), server validation configs, browser types, `server/postgres.ts` schema qualification.
- `scripts/backfill-goals.ts`: requires a verified owner id, dry run by default, `--apply` to write, idempotent, 17 seats as a slice of 68, preserves all history.

### Phase 3 — hierarchy UI + authoritative progress
- `src/lib/goalProgress.ts`: paid-only sales, realised revenue, published content with real dates, sent outreach vs research/replies/calls/proposals, completed project stages in Africa/Lagos time, de-duplicated linked tasks, manual adjustments. Every result carries numerator, denominator, unit, reporting period, source of truth and the contributing record ids.
- `src/pages/Goals.tsx`: monthly cards with drill-down into weekly goals and linked daily deliverables; week navigation; create/edit/archive; explicit carry-forward with `window.confirm`; linking existing tasks; empty states and first-use guidance; source-of-truth and period display on every goal.
- `src/styles/goals.css`; nav label changed to "Goals".

### Phase 4 — onboarding, workspace switching, team lifecycle
- Additive `settings.onboarding_completed` / `onboarding_profile` columns (SQLite + PostgreSQL + validation + types).
- `src/components/Onboarding.tsx`: role/use case, timezone, working days/hours, planning preference, optional focus areas; skippable and reopenable from Settings. New accounts start clean — no owner-specific seed in code or browser bundle.
- `src/components/Shell.tsx` workspace switcher: Personal ↔ Team workspace with clear labels.
- `server/team.ts`: `DELETE /api/team/members/:userId` (owner/manager removal, sessions revoked) and `POST /api/team/leave` (explicit, owner cannot leave).
- `server/index.ts`: `DELETE /api/account` — password + typed confirmation, refuses to orphan other active team members, deletes only that account's records in FK-safe order, clears the session.
- Settings page: reopen setup guide + danger-zone account deletion form.
- My Day already had a distinct `TeamDaySection`; Team Portal already had "My assignments". Both verified.

### Phase 5 — Next Chapter speaker register
- `speakers` and `speaker_followups` tables (SQLite + PostgreSQL + validation + types + postgres qualification).
- `src/pages/Speakers.tsx`: full field set, status filters (invited / awaiting response / confirmed / declined / completed), session linking, follow-up history and logging, ownership, empty state. Explicitly separate from the Graphic Design with AI promotional-partner workflow.
- Nav: "Speaker Register" under Next Chapter.

---

## 2. Verification (all green)

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | ✅ |
| `npm run build` | ✅ (only the non-failing >500 kB chunk advisory) |
| `npm test` | ✅ **19 files / 92 tests** |
| `npm run build:preview` (browser-only fallback) | ✅ |
| Netlify-style CJS Function bundle | ✅ exits 0 |
| `tests/goal-progress.test.ts` (11) | paid-only sales, revenue, publishing, outreach, project stages, dedupe, period, no fabrication, hierarchy links |
| `tests/goal-hierarchy.test.ts` (8) | additive schema, clean accounts, cross-account 404 isolation, FK rejection, idempotent owner-only backfill, onboarding, speaker isolation |
| `tests/goal-migration.test.ts` (1) | PostgreSQL migration on PGlite, re-run safe, tables/columns/indexes/FKs, nothing dropped |
| `tests/account-lifecycle.test.ts` (3) | invite → leave → removal, deletion guards, account deletion + session revocation |
| Existing suites (postgres-integration, netlify-function, api, team, planner, browser-demo, …) | ✅ still green |

---

## 3. Live Supabase `Momentum` — additive migration + owner-only backfill applied

Read-only baseline before any write: 1 owner, 1 November cycle (68 / ₦1,013,200 / 20), 1 product (₦14,900), 9 tasks all `todo` (old routine), 0 weekly reviews, 0 sales, 30 `public` tables / 0 rows, 4 migrations.

**Applied (additive only, no DROP / TRUNCATE / DELETE / UPDATE of existing rows):**
- Versioned migration `goal_hierarchy_and_speakers` → **5 migrations**, 34 `momentum_os` tables, `tasks.weekly_goal_id`, 2 new settings columns.
- Owner-only backfill scoped to `6d8e45af-5bb3-4e40-adb3-e605b9972c79`: **3 monthly goals, 7 weekly goals, 2 goal_links**.

**Verified after:**

| Metric | Value |
| --- | --- |
| `public` rows | 0 (unchanged) |
| owner users / cycles / sales / weekly reviews | 1 / 1 / 0 / 0 (unchanged) |
| tasks | 9, all `todo` (unchanged; none created, completed, deleted or re-linked) |
| monthly / weekly goals / links | 3 / 7 / 2 |
| weekly sales target / monthly sales target | 17 / 68 (slice, not additive) |
| record-backed weekly sources | `sales`, `publishing`, `projects` |
| migrations | 5 |

Netlify production `https://p-momentum-os.netlify.app/api/pg/health` returns 200 with a real write/read round trip. No secrets were read, logged or committed; no second Supabase project; ₦0 infrastructure.

---

## 4. Remaining gaps (honest)

- **Multiple team workspaces per user** — `team_members.user_id` is currently UNIQUE (one team per user). The switcher covers Personal ↔ the single Team workspace. Supporting several teams needs an additive membership table + auth-scope refactor; not done.
- **RLS on the new `momentum_os` tables** — tenant boundaries are enforced server-side by the generic `/api/:resource` layer (`user_id` scoping, tested with 404 responses). The 41 existing RLS policies cover the `public` Supabase-Auth schema. Adding RLS to `momentum_os` (which uses custom bcrypt/cookie auth) needs an identity mapping; not done.
- **Two unrelated individual accounts + two separate teams** — automated tests cover three accounts and one team with role hierarchy; a full two-team matrix is still a manual QA step.
- **Responsive/mobile + accessibility audit** — CSS includes mobile breakpoints, but no manual device/a11y inspection from this sandbox.
- **Deploy preview visual inspection** — `https://deploy-preview-7--p-momentum-os.netlify.app` is behind Netlify **Team protection** ("This site is private"). Automated Netlify checks pass, but a human hasn't visually inspected it from here.
- **PR #6** remains open on its stale base with red CI; close it once PR #7 is accepted.

---

## 5. Release gate (historical — resolved)

Blueprint §10/§11: *"Do not merge or announce shipped until CI is green, preview is inspected, and production deployment is verified."*

- CI ✅ green.
- Netlify deploy preview checks ✅ pass (header rules, redirect rules, deploy preview).
- Production health ✅ verified.
- **Preview visually inspected ❌** — blocked by Netlify Team protection; requires the owner's Netlify session (or disabling site protection).

PR #7 was merged and published (`main@49ae355`), then PR #9 was merged and published (`main@06f9b2f`). Production `/api/pg/health` returns 200 and the sign-in screen now shows both **Sign in** and **Create account** tabs. The protected deploy preview still requires a human Netlify session for visual inspection; PR #6 remains open on its stale base.

---

## 6. Safeguards

No destructive SQL, no deletion of existing records, no planned work marked complete, no owner-specific seed in the browser bundle or in new accounts, no `DATABASE_URL` / service-role key in client code or Git, no auth redesign, no new Supabase project, no paid infrastructure (₦0). All schema changes are additive with documented rollback notes.
