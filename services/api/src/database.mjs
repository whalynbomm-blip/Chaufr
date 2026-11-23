import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const migrationsDirectory = fileURLToPath(new URL("../migrations/", import.meta.url));
const MIGRATION_LOCK_ID = 73_628_104;

export async function applyMigrations(pool, directory = migrationsDirectory) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    const filenames = (await readdir(directory))
      .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
      .sort();

    for (const filename of filenames) {
      const existing = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1",
        [filename],
      );
      if (existing.rowCount) continue;

      const sqlPath = pathToFileURL(`${directory.endsWith("/") ? directory : directory + "/"}${filename}`);
      const sql = await readFile(sqlPath, "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [filename],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Database migration ${filename} failed: ${error.message}`, { cause: error });
      }
    }
    return filenames;
  } finally {
    try { await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]); }
    finally { client.release(); }
  }
}

export async function connectDatabase({
  connectionString = process.env.DATABASE_URL,
  ssl = process.env.DB_SSL === "true",
} = {}) {
  if (!connectionString) throw new TypeError("DATABASE_URL is required");
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString,
    ssl: ssl ? { rejectUnauthorized: true } : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
  });

  try {
    await pool.query("SELECT 1");
    await applyMigrations(pool);
    return pool;
  } catch (error) {
    await pool.end();
    throw error;
  }
}
