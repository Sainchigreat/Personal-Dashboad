import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

describe("legacy theme migration", () => {
  it("migrates old defaults once and retains explicit choices and records", () => {
    const directory = mkdtempSync(join(tmpdir(), "momentum-theme-migration-"));
    try {
      const file = join(directory, "momentum.sqlite");
      const database = new DatabaseSync(file);
      database.exec(
        readFileSync("server/schema.sql", "utf8").replace(
          "theme TEXT NOT NULL DEFAULT 'light'",
          "theme TEXT NOT NULL DEFAULT 'dark'",
        ),
      );
      const user = database.prepare(
        "INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,?,?)",
      );
      const settings = database.prepare(
        "INSERT INTO settings (id,user_id,theme,created_at,updated_at) VALUES (?,?,?,?,?)",
      );
      for (const [id, theme, modified] of [
        ["untouched", "dark", "one"],
        ["saved-dark", "dark", "two"],
        ["saved-light", "light", "two"],
        ["prior-auto", "system", "two"],
      ]) {
        user.run(id, `${id}@example.com`, "hash", "one");
        settings.run(`settings-${id}`, id, theme, "one", modified);
      }
      database
        .prepare(
          "INSERT INTO tasks (id,user_id,title,created_at,updated_at) VALUES (?,?,?,?,?)",
        )
        .run("task-one", "untouched", "A task to keep", "one", "one");
      database.close();

      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          'await import("./server/db.ts")',
        ],
        { cwd: process.cwd(), env: { ...process.env, DATA_DIR: directory } },
      );
      const migrated = new DatabaseSync(file);
      expect(
        migrated
          .prepare("SELECT user_id, theme FROM settings ORDER BY user_id")
          .all(),
      ).toEqual([
        expect.objectContaining({ user_id: "prior-auto", theme: "light" }),
        expect.objectContaining({ user_id: "saved-dark", theme: "dark" }),
        expect.objectContaining({ user_id: "saved-light", theme: "light" }),
        expect.objectContaining({ user_id: "untouched", theme: "light" }),
      ]);
      expect(migrated.prepare("SELECT title FROM tasks").get()?.title).toBe(
        "A task to keep",
      );
      // Explicitly opting back into System after migration survives a restart.
      migrated
        .prepare(
          "UPDATE settings SET theme='system' WHERE user_id='prior-auto'",
        )
        .run();
      migrated.close();
      execFileSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          'await import("./server/db.ts")',
        ],
        { cwd: process.cwd(), env: { ...process.env, DATA_DIR: directory } },
      );
      const reopened = new DatabaseSync(file);
      expect(
        reopened
          .prepare("SELECT theme FROM settings WHERE user_id='prior-auto'")
          .get()?.theme,
      ).toBe("system");
      reopened.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
