import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { applyMigrations } from "./database.mjs";
import { AuthError, createAuthService } from "./auth-service.mjs";
import { createAppServer } from "./http.mjs";

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
    const sessions = await auth.listSessions(registered.user.id, loggedIn.accessToken);
    assert.equal(sessions.sessions.length, 2);
    assert.equal(sessions.sessions.filter((session) => session.is_current).length, 1);
    const oldSession = sessions.sessions.find((session) => !session.is_current);
    assert.equal(await auth.revokeSession(registered.user.id, oldSession.id, loggedIn.accessToken), true);
    assert.equal(await auth.authenticate(registered.accessToken), null);
    assert.equal(await auth.revokeSession(registered.user.id, sessions.sessions.find((session) => session.is_current).id, loggedIn.accessToken), false);
    const replacementSession = await auth.login({
      identifier: "passenger@example.com",
      password: "a-long-test-password-123",
    });
    const revokedOthers = await auth.revokeOtherSessions(registered.user.id, replacementSession.accessToken);
    assert.equal(revokedOthers.revokedCount, 1);
    assert.equal(await auth.authenticate(loggedIn.accessToken), null);
    assert.equal(await auth.authenticate(replacementSession.accessToken) !== null, true);



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

    const server = createAppServer({ database: pool });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const me = await fetch(`${base}/v1/auth/me`, {
        headers: { authorization: `Bearer ${replacementSession.accessToken}` },
      });
      assert.equal(me.status, 200);
      assert.equal((await me.json()).user.id, registered.user.id);

      const createdOverHttp = await fetch(`${base}/v1/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: "HTTP Passenger",
          email: "http@example.com",
          password: "http-test-password-123",
        }),
      });
      assert.equal(createdOverHttp.status, 201);

      const logoutResponse = await fetch(`${base}/v1/auth/logout`, {
        method: "POST",
        headers: { authorization: `Bearer ${registered.accessToken}` },
      });
      assert.equal(logoutResponse.status, 200);
      const revoked = await fetch(`${base}/v1/auth/me`, {
        headers: { authorization: `Bearer ${registered.accessToken}` },
      });
      assert.equal(revoked.status, 401);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }

    assert.equal(await auth.logout(registered.accessToken), false);
    assert.equal(await auth.authenticate(registered.accessToken), null);
    assert.equal(await auth.logout("invalid-token"), false);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});
