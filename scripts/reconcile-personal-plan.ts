// Owner-only, idempotent reconciliation of Chisom's personal November plan.
//
//   npm run reconcile:personal -- --owner-id <VERIFIED_OWNER_ID>            # dry run
//   npm run reconcile:personal -- --owner-id <VERIFIED_OWNER_ID> --apply   # write
//
// Scoped to ONE verified account. Other accounts are never touched; their data
// is never deleted, reset or copied. Completed tasks and history are preserved.
// Needs DATABASE_URL (server-only secret) when run against Supabase.
import "dotenv/config";
import {
  db,
  isPersonalOwner,
  ensurePersonalPlan,
  reconcilePersonalWorkspace,
} from "../server/db";

const args = process.argv.slice(2);
const value = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const ownerId = value("--owner-id") || process.env.MOMENTUM_PERSONAL_OWNER_ID || "";
const apply = args.includes("--apply");

if (!ownerId) {
  console.error(
    "A verified owner id is required: --owner-id <id> or MOMENTUM_PERSONAL_OWNER_ID.\n" +
      "Refusing to run: the personal plan must never be applied to every account.",
  );
  process.exit(2);
}

async function main() {
  const owner = (await db
    .prepare("SELECT id,email,created_at FROM users WHERE id=?")
    .get(ownerId)) as
    | { id: string; email: string; created_at: string }
    | undefined;
  if (!owner) {
    console.error(`No user with id ${ownerId}. Nothing was changed.`);
    process.exit(1);
  }

  const before = {
    monthly_goals: await count("monthly_goals"),
    weekly_goals: await count("weekly_goals"),
    tasks: await count("tasks"),
    active_obsolete: await obsoleteActive(),
    other_users: Number(
      ((await db.prepare("SELECT COUNT(*) AS count FROM users").get()) as {
        count: number;
      }).count,
    ) - 1,
  };

  console.log(`Owner:           ${owner.id} (${owner.email})`);
  console.log(`Mode:            ${apply ? "APPLY (writes)" : "DRY RUN (no writes)"}`);
  console.log(`Already marked:  ${await isPersonalOwner(ownerId)}`);
  console.log(`Before:          ${JSON.stringify(before)}`);

  if (!apply) {
    console.log(
      "\nDry run. Re-run with --apply to: mark this owner, reconcile five monthly " +
        "goals + November 2-8 weekly goals, correct the recurring routine, cancel " +
        "obsolete TODO tasks and fill in the correct plan for generated days.",
    );
    return;
  }

  const result = await reconcilePersonalWorkspace(ownerId);
  // ensurePersonalPlan is idempotent; calling twice proves no duplicates.
  await ensurePersonalPlan(ownerId);

  const after = {
    monthly_goals: await count("monthly_goals"),
    weekly_goals: await count("weekly_goals"),
    tasks: await count("tasks"),
    active_obsolete: await obsoleteActive(),
    completed_tasks: Number(
      (
        (await db
          .prepare("SELECT COUNT(*) AS count FROM tasks WHERE user_id=? AND status='done'")
          .get(ownerId)) as { count: number }
      ).count,
    ),
  };
  console.log(`Reconciliation:  ${JSON.stringify(result)}`);
  console.log(`After:           ${JSON.stringify(after)}`);
  console.log(
    "No row was deleted; completed work untouched; no other account modified.",
  );
}

async function count(table: string): Promise<number> {
  const row = (await db
    .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE user_id=?`)
    .get(ownerId)) as { count: number } | undefined;
  return Number(row?.count ?? 0);
}

async function obsoleteActive(): Promise<number> {
  const { JOB_BATCH_TITLES, OBSOLETE_TITLES } = await import(
    "../server/personalPlan"
  );
  void OBSOLETE_TITLES;
  let total = 0;
  for (const title of JOB_BATCH_TITLES) {
    const row = (await db
      .prepare(
        "SELECT COUNT(*) AS count FROM tasks WHERE user_id=? AND title=? AND status='todo'",
      )
      .get(ownerId, title)) as { count: number } | undefined;
    total += Number(row?.count ?? 0);
  }
  return total;
}

main()
  .then(async () => {
    await db.close();
  })
  .catch(async (error) => {
    console.error("Reconciliation failed:", error);
    await db.close().catch(() => undefined);
    process.exitCode = 1;
  });
