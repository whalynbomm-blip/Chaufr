import test from "node:test";
import assert from "node:assert/strict";
import { applyMigrations } from "./database.mjs";

const databaseUrl = process.env.DATABASE_URL;

test("PostgreSQL migrations create the Chaufr schema and run idempotently", {
  skip: !databaseUrl && "DATABASE_URL is not set; PostgreSQL integration test skipped",
}, async () => {
  const { Pool } = await import("pg");
  const admin = new Pool({ connectionString: databaseUrl });
  const schema = `chaufr_test_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${schema},public`,
  });

  try {
    const first = await applyMigrations(pool);
    const second = await applyMigrations(pool);
    assert.deepEqual(second, first);
    assert.ok(first.includes("0001_initial_schema.sql"));
    assert.ok(first.includes("0003_auth_sessions.sql"));
    assert.ok(first.includes("0026_manual_driver_approval.sql"));
    assert.ok(first.includes("0027_driver_selfie_verification.sql"));

    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = $1",
      [schema],
    );
    const names = new Set(tables.rows.map((row) => row.table_name));
    for (const required of ["users", "trips", "driver_presence", "trip_offers", "auth_sessions", "schema_migrations"]) {
      assert.ok(names.has(required), `expected ${required} table`);
    }
    const applied = await pool.query("SELECT count(*)::int AS count FROM schema_migrations");
    assert.equal(applied.rows[0].count, first.length);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});
