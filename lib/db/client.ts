import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __northStarPool: Pool | undefined;
}

export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  const pool = globalThis.__northStarPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  if (process.env.NODE_ENV !== "production") globalThis.__northStarPool = pool;
  return pool;
}

export function getDatabase() {
  return drizzle(getPool(), { schema });
}
