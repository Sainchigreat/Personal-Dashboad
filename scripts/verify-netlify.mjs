#!/usr/bin/env node
/**
 * Verify a deployed Momentum OS site against its live Netlify Function.
 *
 *   node scripts/verify-netlify.mjs --url https://YOUR-SITE.netlify.app
 *   node scripts/verify-netlify.mjs --url https://YOUR-SITE.netlify.app --acceptance
 *
 * Default mode is READ-ONLY: frontend, auth status, health, routing and
 * redirect checks. --acceptance additionally registers the first owner
 * (only when needsSetup=true), writes ONE task and reads it back. It never
 * deletes anything and never prints cookies, tokens or connection strings.
 */
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    acceptance: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help || !values.url) {
  console.log(
    "Usage: node scripts/verify-netlify.mjs --url https://YOUR-SITE.netlify.app [--acceptance]",
  );
  process.exit(values.help ? 0 : 2);
}

const base = values.url.replace(/\/$/, "");
const results = [];
let cookie = "";
let csrf = "";

function record(name, ok, detail, state) {
  const status = state || (ok ? "pass" : "fail");
  results.push({ name, status, detail });
  console.log(`${status.toUpperCase().padEnd(4)}  ${name.padEnd(38)} ${detail}`);
}

async function call(method, path, body, { useCsrf = true } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf && useCsrf && method !== "GET"
        ? { "X-CSRF-Token": csrf }
        : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* HTML responses are fine for the frontend check */
  }
  return { status: response.status, text, json, response };
}

try {
  // 1. Static frontend (publish = "dist")
  const home = await call("GET", "/");
  record(
    "Frontend HTML served",
    home.status === 200 && /<html|<!doctype/i.test(home.text),
    `HTTP ${home.status}, ${home.text.length} bytes`,
  );

  // 2. SPA fallback for an unknown client-side route
  const spa = await call("GET", "/a/deep/client/route");
  record(
    "SPA fallback",
    spa.status === 200 && /<html|<!doctype/i.test(spa.text),
    `HTTP ${spa.status}`,
  );

  // 3. Auth status
  const status = await call("GET", "/api/auth/status");
  record(
    "Auth status endpoint",
    status.status === 200 && typeof status.json?.needsSetup === "boolean",
    `HTTP ${status.status}, needsSetup=${status.json?.needsSetup}`,
  );

  // 4. Unauthenticated access control
  const protectedRoute = await call("GET", "/api/bootstrap");
  record(
    "Unauthenticated /api/bootstrap blocked",
    protectedRoute.status === 401,
    `HTTP ${protectedRoute.status}`,
  );

  // 5. The function's Supabase connection (503 => DATABASE_URL is not set)
  const health = await call("GET", "/api/pg/health");
  const connected = health.status === 200 && !!health.json?.roundTrip?.id;
  const missingSecret =
    health.status === 503 && /DATABASE_URL/.test(JSON.stringify(health.json));
  record(
    "Supabase connection (/api/pg/health)",
    connected,
    connected
      ? `HTTP 200, round trip id=${health.json.roundTrip.id}, db=${health.json.database}`
      : missingSecret
        ? "HTTP 503 - DATABASE_URL is NOT configured in Netlify (integration outstanding)"
        : `HTTP ${health.status}: ${health.text.slice(0, 160)}`,
    missingSecret ? "warn" : undefined,
  );
  if (!connected) {
    console.log(
      "\nIntegration issue: the deployed function cannot reach Supabase yet. " +
        "Set DATABASE_URL in Netlify -> Site configuration -> Environment variables, " +
        "then redeploy and re-run this script.",
    );
  }

  // 6. Optional write/read acceptance flow
  if (values.acceptance) {
    if (!status.json?.needsSetup) {
      record(
        "Write/read acceptance",
        false,
        "Owner already exists; this script will not touch an existing workspace. Sign in manually.",
      );
    } else {
      const email = `verify-${Date.now()}@momentum.local`;
      const password = `Verify-${Date.now()}-strong-password`;
      const register = await call("POST", "/api/auth/register", {
        name: "Deployment Verification",
        email,
        password,
      });
      const setCookie = register.response.headers.get("set-cookie");
      if (register.status === 200 && setCookie) {
        cookie = setCookie.split(";")[0];
        csrf = register.json.csrfToken;
      }
      record(
        "Owner registration",
        register.status === 200 && !!csrf,
        `HTTP ${register.status}`,
      );

      const bootstrap = await call("GET", "/api/bootstrap");
      record(
        "Bootstrap retrieval",
        bootstrap.status === 200 && Array.isArray(bootstrap.json?.cycles),
        `HTTP ${bootstrap.status}, cycles=${bootstrap.json?.cycles?.length ?? 0}`,
      );

      const created = await call("POST", "/api/tasks", {
        cycle_id: bootstrap.json?.cycles?.[0]?.id,
        title: "Deployment persistence check",
        category: "Personal",
        priority: "low",
      });
      record(
        "Write persistence",
        created.status === 201 && !!created.json?.id,
        `HTTP ${created.status}`,
      );

      const again = await call("GET", "/api/bootstrap");
      record(
        "Read back written record",
        again.json?.tasks?.some((t) => t.id === created.json?.id) === true,
        `HTTP ${again.status}, tasks=${again.json?.tasks?.length ?? 0}`,
      );

      const exportCheck = await call("GET", "/api/export");
      const exported = JSON.stringify(exportCheck.json ?? {});
      record(
        "Export redacts credentials",
        exportCheck.status === 200 &&
          !exported.includes("password_hash") &&
          !exported.includes("token_hash"),
        `HTTP ${exportCheck.status}`,
      );
    }
  }

  const failed = results.filter((r) => r.status === "fail");
  const warned = results.filter((r) => r.status === "warn");
  console.log(
    `\n${results.length - failed.length - warned.length}/${results.length}` +
      ` passed, ${warned.length} outstanding, ${failed.length} failed. Base URL: ${base}`,
  );
  process.exit(failed.length ? 1 : 0);
} catch (error) {
  console.error(`\nCould not reach ${base}: ${error.message}`);
  console.error(
    "Check the URL, the deploy status and the Netlify function logs.",
  );
  process.exit(1);
}
