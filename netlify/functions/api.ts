// Netlify Functions entry point for the existing Express API.
//
// FAIL-CLOSED BY DESIGN. The spec forbids deploying before the schema, function
// and environment variables are ready, and forbids silent data loss. Until the
// route layer is converted to PostgreSQL, this handler returns an explicit 503
// instead of serving the app against an ephemeral SQLite file.
//
// Do not enable MOMENTUM_PG_ROUTES until server/index.ts + server/team.ts use
// the pg helpers in server/postgres.ts. Importing the Express app must not call
// app.listen(), hence MOMENTUM_IMPORT_ONLY.
import serverless from "serverless-http";

type Event = {
  path: string;
  httpMethod: string;
  headers: Record<string, string | undefined>;
  body: string | null;
  isBase64Encoded?: boolean;
  queryStringParameters?: Record<string, string> | null;
  multiValueQueryStringParameters?: Record<string, string[]> | null;
  rawUrl?: string;
  requestContext?: unknown;
};
type Context = Record<string, unknown>;
type Result = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
  multiValueHeaders?: Record<string, string[]>;
};

const json = (statusCode: number, payload: unknown): Result => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(payload),
});

let wrapped: ((event: Event, context: Context) => Promise<Result>) | null = null;

export const handler = async (event: Event, context: Context): Promise<Result> => {
  if (!process.env.DATABASE_URL) {
    return json(503, {
      error: "DATABASE_URL is not configured.",
      where: "Netlify -> Site configuration -> Environment variables",
      note: "Server-only secret. Never prefix it with VITE_.",
    });
  }
  if (process.env.MOMENTUM_PG_ROUTES !== "enabled") {
    return json(503, {
      error: "The PostgreSQL route layer is not active yet.",
      note: "The Express handlers still use SQLite. Refusing to serve them in a serverless function to avoid ephemeral data loss.",
      required: "Convert server/index.ts and server/team.ts to server/postgres.ts helpers, then set MOMENTUM_PG_ROUTES=enabled.",
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
  return wrapped(event, context);
};
