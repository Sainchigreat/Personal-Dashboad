// Owner-scoped, idempotent goal-hierarchy backfill.
//
//   npm run backfill:goals -- --owner-id <VERIFIED_OWNER_ID>            # dry run
//   npm run backfill:goals -- --owner-id <VERIFIED_OWNER_ID> --apply    # write
//
// Rules (implementation blueprint §3, §6, §7):
//  - Only the explicitly verified owner id is touched. Never every account.
//  - Existing monthly cycles, weekly reviews and tasks are INSPECTED and
//    matched, never overwritten, deleted, truncated or marked complete.
//  - Re-running produces no duplicate goals (existence checks, stable ids).
//  - The 17 paid-seat weekly goal is a slice of the existing 68 monthly goal.
//  - Dry run is the default; --apply is required to write.
//  - No secrets: the owner id is an identifier, not a credential. DATABASE_URL
//    is read only from the server environment by server/db.ts.
import "dotenv/config";
import { db, id, now } from "../server/db";

const args = process.argv.slice(2);
const value = (flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const ownerId = value("--owner-id") || process.env.MOMENTUM_OWNER_ID || "";
const weekStart = value("--week") || "2026-11-02";
const apply = args.includes("--apply");

if (!ownerId) {
  console.error(
    "A verified owner id is required: --owner-id <id> or MOMENTUM_OWNER_ID.\n" +
      "Refusing to run: owner-specific starter data must never be applied to every account.",
  );
  process.exit(2);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
  console.error("--week must be YYYY-MM-DD.");
  process.exit(2);
}

const weekEnd = (() => {
  const d = new Date(`${weekStart}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
})();
const month = weekStart.slice(0, 7);
const monthEnd = (() => {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
})();
const stamp = now();

type WeeklySeed = {
  key: string;
  outcome: string;
  target: number;
  unit: string;
  source: string;
  monthlyTitle: string;
  notes: string;
};

// November 2-8 outcomes from the blueprint. `source` records the authoritative
// progress source so task checkboxes can never inflate record-backed goals.
const WEEKLY_SEEDS: WeeklySeed[] = [
  {
    key: "publish",
    outcome: "Publish every day",
    target: 7,
    unit: "days",
    source: "publishing",
    monthlyTitle: "Publish consistently",
    notes:
      "Seven publishing days. Count content records with a real publication date, not task checkboxes.",
  },
  {
    key: "sales",
    outcome: "Sell Graphic Design with AI",
    target: 17,
    unit: "paid buyers",
    source: "sales",
    monthlyTitle: "Sell 68 paid course seats",
    notes:
      "Weekly pace toward the existing 68-seat November target, NOT an additional monthly target. Count paid sales only; exclude pending and refunded.",
  },
  {
    key: "content-bank",
    outcome: "Develop the monthly content bank",
    target: 1,
    unit: "content bank",
    source: "manual",
    monthlyTitle: "Publish consistently",
    notes: "Build the month's ideas, drafts and publishing plan.",
  },
  {
    key: "next-chapter",
    outcome: "Host Next Chapter",
    target: 1,
    unit: "live session",
    source: "manual",
    monthlyTitle: "Publish consistently",
    notes:
      "Friday live session. Speaker register, flyers and asset approvals are tracked in Next Chapter, not here.",
  },
  {
    key: "youtube",
    outcome: "Publish the YouTube free tutorial",
    target: 1,
    unit: "video",
    source: "publishing",
    monthlyTitle: "Publish consistently",
    notes: "Publish by Thursday; derive from a published content record.",
  },
  {
    key: "studio",
    outcome: "Complete two Creative Studio projects",
    target: 2,
    unit: "projects",
    source: "projects",
    monthlyTitle: "Complete two creative projects each week",
    notes: "Derive from project stages/milestones, not generic task completion.",
  },
  {
    key: "brand",
    outcome: "Advance two brand-identity projects",
    target: 2,
    unit: "projects",
    source: "manual",
    monthlyTitle: "Complete two creative projects each week",
    notes:
      "Distinct from Creative Studio projects. First project's content ready Wednesday.",
  },
];

async function count(table: string, owner: string): Promise<number> {
  const row = (await db
    .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE user_id=?`)
    .get(owner)) as { count: number } | undefined;
  return Number(row?.count ?? 0);
}

async function main() {
  const owner = (await db
    .prepare("SELECT id, email, created_at FROM users WHERE id=?")
    .get(ownerId)) as
    | { id: string; email: string; created_at: string }
    | undefined;
  if (!owner) {
    console.error(`No user with id ${ownerId}. Nothing was changed.`);
    process.exit(1);
  }

  const cycle = (await db
    .prepare("SELECT * FROM cycles WHERE user_id=? AND month=?")
    .get(ownerId, month)) as
    | {
        id: string;
        month: string;
        sales_target: number;
        revenue_target: number;
        outreach_target: number;
      }
    | undefined;

  const before = {
    monthly_goals: await count("monthly_goals", ownerId),
    weekly_goals: await count("weekly_goals", ownerId),
    goal_links: Number(((await db.prepare("SELECT COUNT(*) AS count FROM goal_links").get()) as { count: number }).count),
    tasks: await count("tasks", ownerId),
    weekly_reviews: await count("weekly_reviews", ownerId),
    sales: await count("sales", ownerId),
  };

  // A pre-existing JSON weekly plan (PR #6 style) is preserved, not replaced.
  const review = (await db
    .prepare("SELECT id, priorities FROM weekly_reviews WHERE user_id=? AND week_start=?")
    .get(ownerId, weekStart)) as
    | { id: string; priorities: string }
    | undefined;
  let existingPlanGoalCount = 0;
  if (review?.priorities) {
    try {
      const parsed = JSON.parse(review.priorities);
      if (parsed?.version === 1 && Array.isArray(parsed.goals))
        existingPlanGoalCount = parsed.goals.length;
    } catch {
      /* free-text priorities: preserve as-is */
    }
  }

  const monthlyTitles = Array.from(
    new Set(WEEKLY_SEEDS.map((seed) => seed.monthlyTitle)),
  );
  const monthlyTargets: Record<string, { target: number; unit: string; source: string; description: string }> = {
    "Sell 68 paid course seats": {
      target: cycle?.sales_target || 68,
      unit: "paid seats",
      source: "sales",
      description:
        "November operating target. Derived from paid Course Growth transactions only.",
    },
    "Publish consistently": {
      target: 7,
      unit: "days",
      source: "publishing",
      description:
        "Seven-day publishing cadence. Derived from published content records with real publication dates.",
    },
    "Complete two creative projects each week": {
      target: 2,
      unit: "projects",
      source: "projects",
      description:
        "Derived from Creative Studio project stages/milestones, not generic task completion.",
    },
  };

  const plan: Array<{ kind: string; title: string }> = [];
  const monthlyIds = new Map<string, string>();

  for (const title of monthlyTitles) {
    const existing = (await db
      .prepare(
        "SELECT id FROM monthly_goals WHERE user_id=? AND title=? AND start_date=?",
      )
      .get(ownerId, title, `${month}-01`)) as { id: string } | undefined;
    if (existing) {
      monthlyIds.set(title, existing.id);
    } else {
      const meta = monthlyTargets[title];
      plan.push({ kind: "monthly_goal", title });
      monthlyIds.set(title, id());
      void meta;
    }
  }

  const weeklyPlans: Array<{ seed: WeeklySeed; goalId: string; exists: boolean }> = [];
  for (const seed of WEEKLY_SEEDS) {
    const existing = (await db
      .prepare(
        "SELECT id FROM weekly_goals WHERE user_id=? AND week_start=? AND outcome=?",
      )
      .get(ownerId, weekStart, seed.outcome)) as { id: string } | undefined;
    const goalId = existing?.id || id();
    weeklyPlans.push({ seed, goalId, exists: Boolean(existing) });
    if (!existing) plan.push({ kind: "weekly_goal", title: seed.outcome });
  }

  console.log(`Owner:            ${owner.id} (${owner.email})`);
  console.log(`Week:             ${weekStart} -> ${weekEnd} (${month})`);
  console.log(`Mode:             ${apply ? "APPLY (writes)" : "DRY RUN (no writes)"}`);
  console.log(`Existing cycle:   ${cycle ? `${cycle.id} (${cycle.sales_target} seats / ${cycle.revenue_target})` : "none"}`);
  console.log(`Existing plan:    ${existingPlanGoalCount} JSON weekly goal(s) preserved`);
  console.log(`Before:           ${JSON.stringify(before)}`);
  console.log(`Planned inserts:  ${plan.length}`);
  for (const item of plan) console.log(`  + ${item.kind}: ${item.title}`);

  if (!apply) {
    console.log("\nDry run complete. Re-run with --apply to write. No data was changed.");
    return;
  }

  await db.exec("BEGIN IMMEDIATE");
  try {
    for (const title of monthlyTitles) {
      const exists = (await db
        .prepare(
          "SELECT id FROM monthly_goals WHERE user_id=? AND title=? AND start_date=?",
        )
        .get(ownerId, title, `${month}-01`)) as { id: string } | undefined;
      if (exists) continue;
      const meta = monthlyTargets[title];
      await db
        .prepare(
          `INSERT INTO monthly_goals
           (id,user_id,workspace_id,title,description,category,metric_type,source,target,unit,baseline,status,start_date,end_date,notes,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          monthlyIds.get(title)!,
          ownerId,
          "personal",
          title,
          meta.description,
          "November operating plan",
          "outcome",
          meta.source,
          meta.target,
          meta.unit,
          0,
          "active",
          `${month}-01`,
          monthEnd,
          "Backfilled from the existing November cycle; original cycle and records untouched.",
          stamp,
          stamp,
        );
    }

    for (const { seed, goalId } of weeklyPlans) {
      const exists = (await db
        .prepare(
          "SELECT id FROM weekly_goals WHERE user_id=? AND week_start=? AND outcome=?",
        )
        .get(ownerId, weekStart, seed.outcome)) as { id: string } | undefined;
      if (exists) continue;
      await db
        .prepare(
          `INSERT INTO weekly_goals
           (id,user_id,workspace_id,monthly_goal_id,cycle_id,week_start,week_end,outcome,target,unit,source,owner_id,assignee_id,priority,status,visibility,notes,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          goalId,
          ownerId,
          "personal",
          monthlyIds.get(seed.monthlyTitle) || null,
          cycle?.id || null,
          weekStart,
          weekEnd,
          seed.outcome,
          seed.target,
          seed.unit,
          seed.source,
          ownerId,
          null,
          "high",
          "active",
          "private",
          seed.notes,
          stamp,
          stamp,
        );
    }

    // Additional parent relationships (a weekly goal may support more than one
    // monthly goal) are additive and idempotent.
    for (const { seed, goalId } of weeklyPlans) {
      if (seed.key !== "publish" && seed.key !== "youtube") continue;
      const projectsId = monthlyIds.get("Complete two creative projects each week");
      if (!projectsId) continue;
      const link = await db
        .prepare(
          "SELECT 1 FROM goal_links WHERE weekly_goal_id=? AND monthly_goal_id=?",
        )
        .get(goalId, projectsId);
      if (!link)
        await db
          .prepare(
            "INSERT INTO goal_links(user_id,weekly_goal_id,monthly_goal_id,created_at,updated_at) VALUES (?,?,?,?,?)",
          )
          .run(ownerId, goalId, projectsId, stamp, stamp);
    }

    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }

  const after = {
    monthly_goals: await count("monthly_goals", ownerId),
    weekly_goals: await count("weekly_goals", ownerId),
    tasks: await count("tasks", ownerId),
    weekly_reviews: await count("weekly_reviews", ownerId),
    sales: await count("sales", ownerId),
  };
  console.log(`After:            ${JSON.stringify(after)}`);
  console.log(
    "Backfill complete. No task was created, completed, deleted or re-linked; " +
      "no cycle, sale, project, session or preference was modified.",
  );
}

main()
  .then(async () => {
    await db.close();
  })
  .catch(async (error) => {
    console.error("Backfill failed:", error);
    await db.close().catch(() => undefined);
    process.exitCode = 1;
  });
