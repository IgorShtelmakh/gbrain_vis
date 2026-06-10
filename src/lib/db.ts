import { Pool } from "pg";

declare global {
  var pgPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!global.pgPool) {
    global.pgPool = new Pool({
      connectionString: process.env.GBRAIN_DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30_000,
    });
  }
  return global.pgPool;
}
