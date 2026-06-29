import { Pool, type QueryResultRow } from "pg";
import { getEnv } from "@/lib/env";

declare global {
  var __usageHubPool: Pool | undefined;
}

function createPool() {
  const { DATABASE_URL } = getEnv();
  return new Pool({
    connectionString: DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
  });
}

export function getPool() {
  if (!global.__usageHubPool) {
    global.__usageHubPool = createPool();
  }
  return global.__usageHubPool;
}

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []) {
  return getPool().query<T>(text, params);
}

export async function getDatabaseHealth() {
  const started = Date.now();
  const result = await query<{ now: string }>("SELECT NOW()::text AS now");
  return {
    ok: true,
    latencyMs: Date.now() - started,
    now: result.rows[0]?.now ?? null,
  };
}
