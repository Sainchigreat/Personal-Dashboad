// Regression guard for the Netlify Functions bundling failure.
//
// Netlify's esbuild bundler emits this v1 Function as CommonJS. Top-level
// await is a syntax error in a CJS output ("Top-level await is currently not
// supported with the \"cjs\" output format"), so server/*.ts must not use
// module-scope await. This test bundles the real Function entry point exactly
// the way Netlify does and fails if that regresses.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const entry = resolve(process.cwd(), "netlify/functions/api.ts");
const external = ["express", "express-async-errors"];
let directory: string;
const require = createRequire(import.meta.url);

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "momentum-fn-bundle-"));
});
afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe("Netlify Function bundling", () => {
  it("bundles as CommonJS without any top-level await", async () => {
    const outfile = join(directory, "api.cjs");
    // build() throws on esbuild errors; a top-level await would fail here.
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node22",
      outfile,
      external,
      logLevel: "silent",
    });
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(readFileSync(outfile, "utf8")).toContain("handler");
  }, 30000);

  it("loads the CJS bundle and exports a working handler + path normaliser", async () => {
    const outfile = join(directory, "load-test.cjs");
    await build({
      entryPoints: [entry],
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node22",
      outfile,
      external,
      logLevel: "silent",
    });
    const mod = require(outfile);
    expect(typeof mod.handler).toBe("function");
    expect(typeof mod.normalizeEvent).toBe("function");
    expect(
      mod.normalizeEvent({ path: "/.netlify/functions/api/auth/status" }).path,
    ).toBe("/api/auth/status");
  }, 30000);

  it("also bundles as ESM (the Function and its imports are ESM-compatible)", async () => {
    const outfile = join(directory, "api.mjs");
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node22",
      outfile,
      external,
      logLevel: "silent",
    });
    expect(result.errors).toHaveLength(0);
    expect(readFileSync(outfile, "utf8")).toContain("handler");
  }, 30000);

  it("uses only supported [functions] config keys", () => {
    const toml = readFileSync(resolve(process.cwd(), "netlify.toml"), "utf8");
    expect(toml).toContain('node_bundler = "esbuild"');
    // Not a valid @netlify/config [functions] property; adding it is ignored
    // and would give a false sense that ESM output was forced.
    expect(toml).not.toMatch(/^\s*node_module_type\s*=/m);
  });
});
