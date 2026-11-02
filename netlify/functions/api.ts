// Netlify Functions entry point for the async PostgreSQL-backed Express API.
//
// The route layer (server/index.ts, server/team.ts, server/db.ts) is fully
// async and uses server/postgres.ts whenever DATABASE_URL is present. Importing
// the Express app must not call app.listen(), hence MOMENTUM_IMPORT_ONLY.
//
// Fail-closed on the one thing that would silently lose data: if DATABASE_URL
// is missing the app would fall back to an ephemeral SQLite file, so we refuse
// to serve instead.
import serverless from "serverless-http";

type Event = {
  path: string;
  httpMethod: string;
  headers: Record<string, string | undefined>;
  body: string | null;
  isBase64Encoded?: boolean;
  queryStringParameters?: Record<string, string> | null;
  multiValueQueryStringParameters?: Record<string, string[]> | null;
  multiValueHeaders?: Record<string, string[]>;
  rawUrl?: string;
  rawPath?: string;
  rawQueryString?: string;
  requestPath?: string;
  requestContext?: Record<string, unknown>;
  version?: string;
  cookies?: string[];
};
type Context = Record<string, unknown>;
type Result = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
  multiValueHeaders?: Record<string, string[]>;
};

const FN_PREFIX = "/.netlify/functions/api";

/**
 * Netlify's `/api/* -> /.netlify/functions/api/:splat` rewrite may surface
 * either the original path (`/api/...`) or the rewritten function path.
 * Express routes are registered under /api, so normalise both shapes. Also
 * supply the fields serverless-http's AWS provider expects.
 */
export function normalizeEvent(event: Event): Event {
  const raw = event.path || "/";
  const path =
    raw === FN_PREFIX || raw.startsWith(`${FN_PREFIX}/`)
      ? `/api${raw.slice(FN_PREFIX.length)}`
      : raw;
  return {
    ...event,
    path,
    ...(event.rawPath ? { rawPath: path } : {}),
    ...(event.requestPath ? { requestPath: path } : {}),
    body: event.body ?? "",
    headers: event.headers || {},
    isBase64Encoded: event.isBase64Encoded ?? false,
    requestContext: event.requestContext || {},
  };
}

const json = (statusCode: number, payload: unknown): Result => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(payload),
});

let wrapped:
  | ((event: Event, context: Context) => Promise<Result>)
  | null = null;

export const handler = async (
  event: Event,
  context: Context,
): Promise<Result> => {
  if (!process.env.DATABASE_URL) {
    return json(503, {
      error: "DATABASE_URL is not configured.",
      where: "Netlify -> Site configuration -> Environment variables",
      note: "Server-only secret. Never prefix it with VITE_. Without it the API would fall back to an ephemeral SQLite file, so it refuses to start.",
    });
  }
  if (!wrapped) {
    process.env.MOMENTUM_IMPORT_ONLY = "1";
    process.env.DATA_DIR = process.env.DATA_DIR || "/tmp/momentum-data";
    const { app } = await import("../../server/index.ts");
    wrapped = serverless(app) as unknown as (
      event: Event,
      context: Context,
    ) => Promise<Result>;
  }
  return wrapped(normalizeEvent(event), context);
};
