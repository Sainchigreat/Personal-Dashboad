# Momentum OS — goal hierarchy, reconciliation and backfill

**Date:** 2 November 2026
**Branch:** `arena/b038e448-personal-dashboad`
**Status:** Phase 0–2 of the implementation blueprint executed and verified locally. **Not deployed, not merged to `main`, not announced as shipped.**

---

## 1. What changed

### Phase 1 — PR #6 reconciled onto `main`

PR #6 (`feature/november-operating-system`, 15 commits) targeted the **stale** branch `arena/0d207c00-personal-dashboad`, which had already been merged to `main` via PR #4. Its useful content was brought onto this branch **without** switching or pushing to any other branch:

| Kept | Reason |
| --- | --- |
| Reconciled November daily routine (course promotion, warm-lead follow-up, 10 new/emerging + 10 established prospect research, 20 logged outreach actions, 3 course promotional partners — **not** Next Chapter, daily publishing, daily close-out) | Matches blueprint §3 |
| Removal of the retired 05:00 / 06:00 / 08:00 job-search batches, with reconciliation of the *exact* legacy starter routine while preserving user-authored tasks | Blueprint §3 "reconcile duplicates and obsolete routines" |
| Weekday-specific Nov 2–8 execution tasks (Monday project selection, team meeting, designer briefs, Social Media Manager recruitment, Thursday YouTube tutorial, Friday Next Chapter, two Creative Studio projects, two distinct brand-identity projects) | Blueprint §3 |
| Weekly Goals nav page (`src/pages/Goals.tsx`) | Foundation for §4.2 |
| Existing 68 / ₦1,013,200 / ₦14,900 November targets | Preserved |

| Fixed / rejected | Reason |
| --- | --- |
| PR #6's `server/index.ts` patch | Discarded. It duplicated the top-level-await removal already on `main` (`93a48bd`) and would have conflicted. `main`'s async-IIFE fix is retained. |
| PR #6 CI failure at `tests/planner.test.ts:75` | The test expected the YouTube tutorial on Tuesday; the code (and the brief: "by Thursday") schedules it Thursday. Assertions corrected and a negative Tuesday assertion added. |
| `createWorkspace` seeding the November plan for `NODE_ENV=production` | **Removed.** That seeded Chisom's plan into every new production account, violating §5.1 and §6. |
| `Goals.tsx` falling back to owner-specific starter goals for every account | **Removed.** New accounts now see an empty state with first-use guidance. |
| Progress from task checkboxes for record-backed goals | **Guarded.** Each goal declares a `source` (`tasks` / `manual` / `records`). Record-backed goals never count linked task completion; sales, revenue, publishing and outreach must come from specialist-module records (§7). |
| CI branch filters | Now `arena/**`, `feature/**`, `main` so a new session branch's pushes trigger CI. |

> **Correction to an earlier assessment:** I previously reported that PR #6 contained `Promise` / `Partial` type errors. That was a **rendering artefact** of the GitHub API markdown stripping `<void>` / `<Goal>` as HTML tags. Verified in the fetched source: `Promise<void>` and `Partial<Goal>` are correct. PR #6's only CI failure was the Tuesday/Thursday test mismatch.

### Phase 2 — additive goal hierarchy + owner-only backfill

**New entities** (all `CREATE TABLE IF NOT EXISTS`, no DROP/TRUNCATE/rename/overwrite):

- `monthly_goals` — `workspace_id`, `owner scope via user_id`, `metric_type`, `source`, `target`, `unit`, `baseline`, `status`, `start_date`/`end_date`, notes.
- `weekly_goals` — `monthly_goal_id` (primary parent), `cycle_id`, week range, outcome, target/unit, `source`, `owner_id`, `assignee_id`, priority, status, `visibility`.
- `goal_links` — a weekly goal may support more than one monthly goal.
- `tasks.weekly_goal_id` — optional daily-deliverable link; ad hoc work stays unlinked.

Added to: `server/schema.sql`, the additive SQLite migration in `server/db.ts`, the versioned PostgreSQL migration `supabase/migrations/20261102000500_goal_hierarchy.sql`, `server/validation.ts` configs + `foreignKeys`, and `src/types.ts`. Indexes cover workspace, owner, date range, parent goal, assignee and status. The generic `/api/:resource` routes scope every read/write by `user_id`, so goal records are private by default.

**`scripts/backfill-goals.ts`** (`npm run backfill:goals`):
- Requires an explicit verified owner id (`--owner-id` or `MOMENTUM_OWNER_ID`); **refuses to run without it**.
- **Dry run by default**; `--apply` is required to write.
- Matches the existing November cycle, weekly reviews and task history; preserves original IDs and all existing rows.
- Idempotent (existence checks); re-running produces **0** new inserts.
- 17 paid seats is recorded as a **slice of the 68 monthly target**, not an additional target.
- Creates no tasks, completes nothing, deletes nothing, and does not modify cycles, sales, projects, sessions or preferences.

---

## 2. Verification performed

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | ✅ |
| `npm run build` | ✅ |
| `npm test` | ✅ 17 files / 75 tests (69 existing + 5 hierarchy + 1 migration) |
| New `tests/goal-hierarchy.test.ts` | ✅ additive schema, clean new accounts, cross-account API isolation (404, no existence leak), monthly→weekly→daily links, FK rejection, owner-only idempotent backfill, refusal without owner id |
| New `tests/goal-migration.test.ts` | ✅ applies the PostgreSQL migration to a real PGlite engine, re-runs safely, verifies tables/column/indexes/FKs and that no original table is dropped |
| Netlify-style CJS Function bundle | ✅ still exits 0 after all changes |
| Live Supabase / Netlify | **Read-only checks only.** No migration applied, no data written. |

---

## 3. Live production baseline (read-only, not modified)

- Netlify production `https://p-momentum-os.netlify.app/`: sign-in page renders, `/api/pg/health` returns 200 with a real round trip, `/api/auth/status` → `needsSetup:false`.
- Live `Momentum` project: 30 `public` tables / 0 rows, 41 policies, 4 migrations; `momentum_os` has **1 owner**, 1 November cycle (68 / ₦1,013,200 / 20), 1 product (₦14,900), **9 tasks all `todo`** (old routine with retired 5/6/8 AM batches), **0 weekly reviews**, 0 sales.
- **The feature-branch November weekly plan is NOT live.** It must be applied by the owner-scoped backfill, not by re-seeding.

---

## 4. Exact next actions (Phases 3–6, not done)

1. **Confirm the verified owner id** for the live account. The live owner row exists; I will not apply a backfill to production without your explicit go-ahead.
2. **Apply `supabase/migrations/20261102000500_goal_hierarchy.sql`** to the live project via a versioned Supabase migration (additive only), then verify table/column counts.
3. **Run `npm run backfill:goals -- --owner-id <id>`** (dry run first, then `--apply`) against the live database from a host with `DATABASE_URL`, then confirm 3 monthly / 7 weekly goals, 0 duplicate tasks, and unchanged task statuses.
4. **Phase 3:** goal drill-down UI, week navigation, explicit carry-forward, weekly review, and authoritative progress integration (paid-only sales, published content, project stages, research vs sent outreach vs replies vs follow-ups, promotional partners separate from Next Chapter speakers). Show numerator/denominator/unit/period/source-of-truth and auditable manual adjustments.
5. **Phase 4:** onboarding (role, timezone, working days/hours, preferences, optional template, skippable/resumable), workspace switching, multi-team membership, invitation acceptance/removal/role change/leave/account deletion, Personal vs Team sections in My Day.
6. **Phase 5:** structured Next Chapter speaker register (separate from course promotional partners).
7. **Phase 6:** full QA (two unrelated accounts, two teams, Africa/Lagos date boundaries, empty states, responsive/a11y), production build, Netlify **deploy preview inspected**, smoke tests, then merge to `main` and verify production. **No merge or "shipped" claim before CI is green and the preview is inspected.**

---

## 5. Safeguards

No second Supabase project, no auth redesign, no destructive SQL, no deletion of existing records, no planned work marked complete, no owner-specific seed in the browser bundle or in new accounts, no `DATABASE_URL`/service-role key in client code or Git, no paid infrastructure (₦0).
