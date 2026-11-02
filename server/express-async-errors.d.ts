// Side-effect-only patch: Express 4 forwards rejected async handlers to the
// error middleware, so awaited PostgreSQL failures reach next(error).
declare module "express-async-errors";
