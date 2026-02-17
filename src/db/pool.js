import pg from "pg";
import { ensureSecrets } from "./ensureSecrets.js";
import { ensureSchema } from "./ensureSchema.js";

const { Pool } = pg;
let poolInstance = null;

async function getPool() {
  if (poolInstance) return poolInstance;
  await ensureSecrets();
  const connectionString = process.env.DATABASE_URL?.trim();
  const validScheme = connectionString?.startsWith("postgresql") || connectionString?.startsWith("postgres://");
  if (!connectionString || connectionString === "undefined" || !validScheme) {
    const hint = !connectionString ? "missing" : connectionString === "undefined" ? "literal 'undefined'" : "invalid format (expected postgresql://...)";
    throw new Error(`DATABASE_URL ${hint} after ensureSecrets. Rebuild and redeploy, verify Secret Manager 'database-url', and indexer SA has secretmanager.secretAccessor. Set DEBUG_SECRETS=1 for env diagnostics.`);
  }
  poolInstance = new Pool({ connectionString });
  await ensureSchema(poolInstance);
  return poolInstance;
}

export async function withClient(fn) {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
