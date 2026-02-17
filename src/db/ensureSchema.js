/** Ensure tables exist before use. Idempotent (CREATE TABLE IF NOT EXISTS).
 *  pgvector extension must exist first (run enable-pgvector.sh once).
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

let ensured = false;

function getSchemaSql() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const schemaPath = join(__dirname, "../../sql/schema.sql");
  let sql = readFileSync(schemaPath, "utf8");
  sql = sql.replace(/^CREATE EXTENSION IF NOT EXISTS vector;\s*/m, "");
  return sql;
}

export async function ensureSchema(pool) {
  if (ensured) return;
  const client = await pool.connect();
  try {
    await client.query(getSchemaSql());
    ensured = true;
  } catch (e) {
    if (e.code === "42704" || (e.message && e.message.includes("vector")) || (e.message && e.message.includes("does not exist"))) {
      throw new Error(
        "Schema setup failed (pgvector extension or tables missing). Run infra/gcp/singing-duck/scripts/enable-pgvector.sh once."
      );
    }
    throw e;
  } finally {
    client.release();
  }
}
