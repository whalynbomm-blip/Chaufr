import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { applyMigrations } from "./database.mjs";
import { AuthError, createAuthService } from "./auth-service.mjs";

const databaseUrl = process.env.DATABASE_URL;

test("registration, login, session validation and logout work with PostgreSQL", {
  skip: !databaseUrl && "DATABASE_URL is not set; PostgreSQL auth integration test skipped",
}, async () => {
  const admin = new Pool({ connectionString: databaseUrl });
  const schema = `chaufr_auth_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${schema},public`,
  });

  try {
    await applyMigrations(pool);
    const auth = createAuthService(pool);
    const registered = await auth.register({
      displayName: "Chaufr Passenger",
      email: "Passenger@Example.com",
      password: "a-long-test-password-123",
      role: "passenger",
    });
    assert.equal(registered.user.email, "passenger@example.com");
    assert.equal(registered.user.role, "passenger");
    assert.match(registered.accessToken, /^chf_/);
    assert.equal(await auth.authenticate(registered.accessToken) !== null, true);

    const loggedIn = await auth.login({
      identifier: "PASSENGER@example.com",
      password: "a-long-test-password-123",
    });
    assert.equal(loggedIn.user.id, registered.user.id);
    assert.equal(await auth.authenticate(loggedIn.accessToken) !== null, true);

    await assert.rejects(
      () => auth.login({ identifier: "passenger@example.com", password: "wrong-password" }),
      (error) => error instanceof AuthError && error.status === 401,
    );
    await assert.rejects(
      () => auth.register({
        displayName: "Fake Owner", email: "owner@example.com",
        password: "a-long-test-password-123", role: "owner",
      }),
      (error) => error instanceof AuthError && error.status === 403,
    );
    await assert.rejects(
      () => auth.register({
        displayName: "Duplicate", email: "passenger@example.com",
        password: "a-long-test-password-123",
      }),
      (error) => error instanceof AuthError && error.status === 409,
    );

    const driver = await auth.register({
      displayName: "Chaufr Driver",
      phone: "+27821234567",
      password: "another-long-password-123",
      role: "driver",
    });
    const profile = await pool.query(
      "SELECT verification_status FROM driver_profiles WHERE user_id = $1",
      [driver.user.id],
    );
    assert.equal(profile.rows[0].verification_status, "pending");

    assert.equal(await auth.logout(registered.accessToken), true);
    assert.equal(await auth.authenticate(registered.accessToken), null);
    assert.equal(await auth.logout("invalid-token"), false);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});
