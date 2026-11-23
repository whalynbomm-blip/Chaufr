import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { applyMigrations } from "./database.mjs";
import { createAuthService } from "./auth-service.mjs";
import { createDriverService } from "./driver-service.mjs";
import { createAppServer } from "./http.mjs";

const databaseUrl = process.env.DATABASE_URL;
const testKey = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

test("driver onboarding encrypts identifiers and gates online status", {
  skip: !databaseUrl && "DATABASE_URL is not set; PostgreSQL driver integration test skipped",
}, async () => {
  const admin = new Pool({ connectionString: databaseUrl });
  const schema = `chaufr_driver_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({
    connectionString: databaseUrl,
    options: `-c search_path=${schema},public`,
  });
  let server;

  try {
    await applyMigrations(pool);
    const auth = createAuthService(pool);
    const drivers = createDriverService(pool, testKey);
    const account = await auth.register({
      displayName: "Test Driver",
      phone: "+27821112222",
      password: "test-driver-password-123",
      role: "driver",
    });

    const submitted = await drivers.submitVehicle(account.user, {
      category: "standard",
      make: "Toyota",
      model: "Corolla",
      registration: "CA 123-456",
      licenceNumber: "123456789012",
      fuelConsumptionLitresPer100Km: 7.8,
    });
    assert.equal(submitted.verificationStatus, "in_review");
    assert.equal(submitted.vehicle.status, "pending");

    const stored = await pool.query(
      `SELECT v.registration_encrypted, d.licence_number_encrypted
       FROM vehicles v JOIN driver_profiles d ON d.user_id = v.driver_user_id
       WHERE v.id = $1`,
      [submitted.vehicle.id],
    );
    assert.notEqual(stored.rows[0].registration_encrypted.toString("utf8"), "CA 123-456");
    assert.notEqual(stored.rows[0].licence_number_encrypted.toString("utf8"), "123456789012");
    const profile = await drivers.getProfile(account.user);
    assert.equal(profile.vehicles.length, 1);
    assert.equal("registration" in profile.vehicles[0], false);

    await assert.rejects(
      () => drivers.setPresence(account.user, { isOnline: true, latitude: -33.9, longitude: 18.4 }),
      (error) => error.status === 403,
    );

    server = createAppServer({ database: pool });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const vehicleResponse = await fetch(`${base}/v1/driver/profile`, {
      headers: { authorization: `Bearer ${account.accessToken}` },
    });
    assert.equal(vehicleResponse.status, 200);

    await pool.query("UPDATE driver_profiles SET verification_status = 'verified' WHERE user_id = $1", [account.user.id]);
    await pool.query("UPDATE vehicles SET status = 'approved' WHERE id = $1", [submitted.vehicle.id]);

    const online = await fetch(`${base}/v1/driver/presence`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${account.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ isOnline: true, latitude: -33.9, longitude: 18.4, accuracyMeters: 12 }),
    });
    assert.equal(online.status, 200);
    assert.equal((await online.json()).isOnline, true);

    const offline = await fetch(`${base}/v1/driver/presence`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${account.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ isOnline: false }),
    });
    assert.equal(offline.status, 200);
    assert.equal((await offline.json()).isOnline, false);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});
