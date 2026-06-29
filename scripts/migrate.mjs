import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const migrationsDir = resolve(process.cwd(), "db", "migrations");
const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
const client = new Client({ connectionString: databaseUrl });

await client.connect();

try {
  await client.query("BEGIN");
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const file of files) {
    const applied = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
    if (applied.rowCount) continue;

    const sql = await readFile(resolve(migrationsDir, file), "utf8");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [file]);
    console.log(`Applied ${file}`);
  }

  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
