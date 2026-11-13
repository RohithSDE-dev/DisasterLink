import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

// DATABASE_URL is provided at runtime by Vercel. Do not throw while Next.js
// evaluates server modules during the deployment build.
const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  (databaseUrl ? new Pool({ connectionString: databaseUrl }) : new Pool());

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export { pool };
export const db = drizzle(pool);
