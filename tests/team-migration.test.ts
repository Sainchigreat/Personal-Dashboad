import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

describe("team workspace migration", () => {
  it("adds team tables and account roles without altering legacy personal records", () => {
    const directory = mkdtempSync(join(tmpdir(), "momentum-team-migration-"));
    try {
      const file = join(directory, "momentum.sqlite");
      const database = new DatabaseSync(file);
      // A pre-team version had neither account_type nor any team tables.
      const oldSchema = readFileSync("server/schema.sql", "utf8")
        .split("-- Shared Team Workspace")[0]
        .replace(
          "  account_type TEXT NOT NULL DEFAULT 'owner' CHECK(account_type IN ('owner','team')),\n",
          "",
        );
      database.exec(oldSchema);
      database
        .prepare(
          "INSERT INTO users(id,email,password_hash,created_at) VALUES (?,?,?,?)",
        )
        .run("legacy-owner", "legacy@example.com", "hash", "old");
      database
        .prepare(
          "INSERT INTO settings(id,user_id,name,theme,created_at,updated_at) VALUES (?,?,?,?,?,?)",
        )
        .run("settings", "legacy-owner", "Legacy", "light", "old", "old");
      database
        .prepare(
          "INSERT INTO tasks(id,user_id,title,created_at,updated_at) VALUES (?,?,?,?,?)",
        )
        .run(
          "old-task",
          "legacy-owner",
          "Keep this private task",
          "old",
          "old",
        );
      database
        .prepare(
          "INSERT INTO sales(id,user_id,amount,sale_date,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
        )
        .run(
          "old-sale",
          "legacy-owner",
          123,
          "2026-11-03",
          "paid",
          "old",
          "old",
        );
      database.close();
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `const m = await import('./server/db.ts'); m.ensureTeamOwnerWorkspace('legacy-owner'); m.ensureTeamOwnerWorkspace('legacy-owner'); m.db.close();`,
        ],
        { cwd: process.cwd(), env: { ...process.env, DATA_DIR: directory } },
      );
      const migrated = new DatabaseSync(file);
      expect(
        migrated
          .prepare("SELECT account_type FROM users WHERE id=?")
          .get("legacy-owner")?.account_type,
      ).toBe("owner");
      expect(
        migrated.prepare("SELECT title FROM tasks WHERE id=?").get("old-task")
          ?.title,
      ).toBe("Keep this private task");
      expect(
        migrated.prepare("SELECT amount FROM sales WHERE id=?").get("old-sale")
          ?.amount,
      ).toBe(123);
      expect(
        migrated
          .prepare("SELECT theme FROM settings WHERE user_id=?")
          .get("legacy-owner")?.theme,
      ).toBe("light");
      expect(
        migrated.prepare("SELECT COUNT(*) AS count FROM team_workspaces").get()
          ?.count,
      ).toBe(1);
      expect(
        migrated
          .prepare(
            "SELECT COUNT(*) AS count FROM team_members WHERE user_id='legacy-owner' AND role='owner'",
          )
          .get()?.count,
      ).toBe(1);
      migrated.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("converts members from the earlier GitHub draft into team-only accounts without deleting data", () => {
    const directory = mkdtempSync(join(tmpdir(), "momentum-team-draft-"));
    try {
      const file = join(directory, "momentum.sqlite");
      const database = new DatabaseSync(file);
      const draftSchema = readFileSync("server/schema.sql", "utf8")
        .replace(
          "  account_type TEXT NOT NULL DEFAULT 'owner' CHECK(account_type IN ('owner','team')),\n",
          "",
        )
        .replace("  submission TEXT NOT NULL DEFAULT '',\n", "");
      database.exec(draftSchema);
      const addUser = database.prepare(
        "INSERT INTO users(id,email,password_hash,created_at) VALUES (?,?,?,?)",
      );
      const addSettings = database.prepare(
        "INSERT INTO settings(id,user_id,name,created_at,updated_at) VALUES (?,?,?,?,?)",
      );
      for (const user of ["owner", "manager", "member"]) {
        addUser.run(user, `${user}@example.com`, "hash", "old");
        addSettings.run(`settings-${user}`, user, user, "old", "old");
      }
      database
        .prepare(
          "INSERT INTO team_workspaces(id,owner_user_id,name,created_at,updated_at) VALUES (?,?,?,?,?)",
        )
        .run("shared", "owner", "Team", "old", "old");
      const addMember = database.prepare(
        "INSERT INTO team_members(id,workspace_id,user_id,role,status,joined_at) VALUES (?,?,?,?,?,?)",
      );
      addMember.run("m-owner", "shared", "owner", "owner", "active", "old");
      addMember.run(
        "m-manager",
        "shared",
        "manager",
        "manager",
        "active",
        "old",
      );
      addMember.run("m-member", "shared", "member", "member", "active", "old");
      database
        .prepare(
          "INSERT INTO tasks(id,user_id,title,created_at,updated_at) VALUES (?,?,?,?,?)",
        )
        .run("old-seed", "member", "Preserve legacy seed", "old", "old");
      database
        .prepare(
          "INSERT INTO team_tasks(id,workspace_id,title,assignee_user_id,reviewer_user_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
        )
        .run(
          "shared-task",
          "shared",
          "Keep shared work",
          "member",
          "owner",
          "owner",
          "old",
          "old",
        );
      database.close();
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `const m = await import('./server/db.ts'); m.db.close();`,
        ],
        { cwd: process.cwd(), env: { ...process.env, DATA_DIR: directory } },
      );
      const migrated = new DatabaseSync(file);
      expect(
        migrated.prepare("SELECT id,account_type FROM users ORDER BY id").all(),
      ).toEqual([
        expect.objectContaining({ id: "manager", account_type: "team" }),
        expect.objectContaining({ id: "member", account_type: "team" }),
        expect.objectContaining({ id: "owner", account_type: "owner" }),
      ]);
      expect(
        migrated.prepare("SELECT title FROM tasks WHERE id='old-seed'").get()
          ?.title,
      ).toBe("Preserve legacy seed");
      expect(
        migrated
          .prepare(
            "SELECT title,submission FROM team_tasks WHERE id='shared-task'",
          )
          .get(),
      ).toMatchObject({ title: "Keep shared work", submission: "" });
      expect(
        migrated.prepare("SELECT COUNT(*) AS count FROM team_workspaces").get()
          ?.count,
      ).toBe(1);
      migrated.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
