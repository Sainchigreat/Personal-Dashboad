import { describe, expect, it } from "vitest";
import {
  PG_SCHEMA,
  TABLES,
  isPostgresConfigured,
  normaliseError,
  qualifyTables,
  toPostgres,
  translatePlaceholders,
} from "../server/postgres";

describe("PostgreSQL connection layer", () => {
  it("does not create a pool or require credentials at import time", () => {
    expect(typeof isPostgresConfigured()).toBe("boolean");
    expect(TABLES).toContain("users");
    expect(TABLES).toContain("auth_sessions");
    // Goal-hierarchy tables must be qualified to momentum_os or bootstrap
    // queries would accidentally hit the public schema.
    expect(TABLES).toContain("monthly_goals");
    expect(TABLES).toContain("weekly_goals");
    expect(TABLES).toContain("goal_links");
    expect(PG_SCHEMA).toBe("momentum_os");
  });

  it("translates ? placeholders into ordered $n parameters", () => {
    expect(translatePlaceholders("SELECT * FROM tasks WHERE user_id=? AND day=?")).toBe(
      "SELECT * FROM tasks WHERE user_id=$1 AND day=$2",
    );
  });

  it("never rewrites question marks inside string literals", () => {
    expect(translatePlaceholders("SELECT 'a?b' AS value, id FROM tasks WHERE id=?")) .toBe(
      "SELECT 'a?b' AS value, id FROM tasks WHERE id=$1",
    );
    expect(translatePlaceholders("SELECT 'it''s ?' AS value WHERE x=?")).toBe(
      "SELECT 'it''s ?' AS value WHERE x=$1",
    );
  });

  it("qualifies known tables while preserving aliases and existing prefixes", () => {
    expect(qualifyTables("SELECT * FROM tasks t JOIN users u ON u.id=t.user_id")).toBe(
      `SELECT * FROM ${PG_SCHEMA}.tasks t JOIN ${PG_SCHEMA}.users u ON u.id=t.user_id`,
    );
    expect(qualifyTables("UPDATE settings SET theme=? WHERE user_id=?")).toBe(
      `UPDATE ${PG_SCHEMA}.settings SET theme=? WHERE user_id=?`,
    );
    expect(qualifyTables("SELECT * FROM momentum_os.tasks")).toBe(
      "SELECT * FROM momentum_os.tasks",
    );
  });

  it("converts SQLite transaction and upsert syntax", () => {
    expect(toPostgres("BEGIN IMMEDIATE")).toBe("BEGIN");
    expect(toPostgres("PRAGMA table_info(users)")).toBe("");
    expect(
      toPostgres("INSERT OR IGNORE INTO generated_days(user_id,day) VALUES (?,?)"),
    ).toBe(
      `INSERT INTO ${PG_SCHEMA}.generated_days(user_id,day) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    );
  });

  it("keeps the existing API's error handling semantics", () => {
    expect(normaliseError({ code: "23505", message: "duplicate key" }).message).toContain(
      "UNIQUE constraint failed",
    );
    expect(normaliseError({ code: "23503", message: "fk" }).message).toContain(
      "INVALID_REFERENCE",
    );
  });
});
