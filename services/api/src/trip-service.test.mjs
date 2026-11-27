import test from "node:test";
import assert from "node:assert/strict";
import { createTripService } from "./trip-service.mjs";

test("driver earnings are scoped to the authenticated driver and returned as numeric totals", async () => {
  const calls = [];
  const pool = {
    connect: async () => { throw new Error("connect should not be used"); },
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("COUNT(*)::int AS lifetime_trips")) {
        return { rows: [{ lifetime_trips: 12, lifetime_earnings: "1840.50", today_trips: 2, today_earnings: "310.00" }] };
      }
      if (sql.includes("pickup_label")) {
        return { rows: [{
          id: "123e4567-e89b-12d3-a456-426614174000",
          pickup_label: "Pinelands",
          destination_label: "Cape Town CBD",
          driver_earnings: "155.00",
          quoted_total: "175.00",
          completed_at: "2026-11-27T00:00:00.000Z",
          reward_redemption: "false",
          payment_status: "paid",
        }] };
      }
      throw new Error("Unexpected query");
    },
  };
  const service = createTripService(pool, { dailyActivationFee: 30 });
  const result = await service.getDriverEarnings({ id: "driver-1", role: "driver" });

  assert.equal(result.todayTrips, 2);
  assert.equal(result.todayEarnings, 310);
  assert.equal(result.lifetimeTrips, 12);
  assert.equal(result.lifetimeEarnings, 1840.5);
  assert.equal(result.recentTrips.length, 1);
  assert.equal(result.recentTrips[0].driverEarnings, 155);
  assert.equal(result.recentTrips[0].rewardRide, false);
  assert.ok(calls.every((call) => call.params[0] === "driver-1"));
});

test("driver earnings endpoint service rejects non-driver accounts", async () => {
  const pool = { connect: async () => {}, query: async () => { throw new Error("database should not be queried"); } };
  const service = createTripService(pool, { dailyActivationFee: 30 });
  await assert.rejects(
    service.getDriverEarnings({ id: "passenger-1", role: "passenger" }),
    /driver account required/i,
  );
});

test("development-only activation bypass is explicitly labelled and avoids payment setup", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousBypass = process.env.CHAUFR_TEST_BYPASS_ACTIVATION;
  process.env.NODE_ENV = "development";
  process.env.CHAUFR_TEST_BYPASS_ACTIVATION = "true";
  try {
    const pool = {
      connect: async () => { throw new Error("connect should not be used"); },
      query: async () => { throw new Error("development bypass should not query payment records"); },
    };
    const service = createTripService(pool, { dailyActivationFee: 30 });
    const status = await service.getActivationStatus({ id: "driver-1", role: "driver" });
    assert.equal(status.isPaid, true);
    assert.equal(status.testBypass, true);
    assert.equal(status.status, "test_bypass");
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousBypass === undefined) delete process.env.CHAUFR_TEST_BYPASS_ACTIVATION;
    else process.env.CHAUFR_TEST_BYPASS_ACTIVATION = previousBypass;
  }
});

test("activation bypass is ignored in production even when the flag is present", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousBypass = process.env.CHAUFR_TEST_BYPASS_ACTIVATION;
  process.env.NODE_ENV = "production";
  process.env.CHAUFR_TEST_BYPASS_ACTIVATION = "true";
  try {
    const pool = {
      connect: async () => {},
      query: async () => ({ rows: [] }),
    };
    const service = createTripService(pool, { dailyActivationFee: 30 });
    const status = await service.getActivationStatus({ id: "driver-1", role: "driver" });
    assert.equal(status.isPaid, false);
    assert.equal(status.testBypass, false);
    assert.equal(status.status, "unpaid");
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousBypass === undefined) delete process.env.CHAUFR_TEST_BYPASS_ACTIVATION;
    else process.env.CHAUFR_TEST_BYPASS_ACTIVATION = previousBypass;
  }
});

test("passenger trip history includes the persisted payment status", async () => {
  let queryText = "";
  const pool = {
    connect: async () => {},
    query: async (sql, params) => {
      queryText = sql;
      assert.equal(params[0], "passenger-1");
      return { rows: [{
        id: "123e4567-e89b-12d3-a456-426614174000",
        status: "completed",
        payment_status: "unpaid",
        pickup_label: "Pinelands",
        destination_label: "Cape Town CBD",
        quoted_total: "100.00",
        passenger_payable: "100.00",
        distance_km: "8.5",
        duration_minutes: "22",
        requested_at: "2026-11-27T00:00:00.000Z",
        accepted_at: null,
        started_at: null,
        completed_at: "2026-11-27T00:30:00.000Z",
      }] };
    },
  };
  const service = createTripService(pool, { dailyActivationFee: 30 });
  const history = await service.getPassengerTripHistory({ id: "passenger-1", role: "passenger" });
  assert.match(queryText, /payment_status/);
  assert.equal(history[0].paymentStatus, "unpaid");
  assert.equal(history[0].status, "completed");
});


test("passenger trip status returns a cached live traffic ETA from the latest driver GPS position", async () => {
  let routeCalls = 0;
  const pool = {
    connect: async () => { throw new Error("connect should not be used"); },
    query: async () => ({
      rows: [{
        id: "123e4567-e89b-12d3-a456-426614174000",
        status: "in_progress",
        pickup_label: "Pinelands",
        destination_label: "Cape Town CBD",
        quoted_total: "100.00",
        passenger_payable: "100.00",
        distance_km: "8.5",
        duration_minutes: "22",
        requested_at: new Date().toISOString(),
        accepted_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        completed_at: null,
        encoded_polyline: "encoded",
        pickup_location: { latitude: -33.93, longitude: 18.51 },
        destination_location: { latitude: -33.92, longitude: 18.42 },
        driver_user_id: "driver-1",
        driver_name: "Test Driver",
        driver_rating: "4.9",
        vehicle_make: "Ford",
        vehicle_model: "Figo",
        vehicle_category: "standard",
        driver_latitude: -33.925,
        driver_longitude: 18.48,
        location_accuracy_m: "8",
        last_seen_at: new Date().toISOString(),
      }],
    }),
  };
  const routesService = {
    computeRoute: async (origin, destination) => {
      routeCalls += 1;
      assert.equal(origin.latitude, -33.925);
      assert.equal(destination.latitude, -33.92);
      return { durationMinutes: 11, distanceKm: 4.2 };
    },
  };
  const service = createTripService(pool, { dailyActivationFee: 30 }, routesService);
  const passenger = { id: "passenger-1", role: "passenger" };
  const first = await service.getPassengerTripStatus(passenger, "123e4567-e89b-12d3-a456-426614174000");
  const second = await service.getPassengerTripStatus(passenger, "123e4567-e89b-12d3-a456-426614174000");
  assert.equal(first.liveTrafficEtaMinutes, 11);
  assert.equal(first.liveTrafficRemainingKm, 4.2);
  assert.equal(second.liveTrafficEtaMinutes, 11);
  assert.equal(routeCalls, 1, "mobile refreshes should reuse the one-minute route cache");
});


test("driver arrival advances an accepted trip and notifies the passenger", async () => {
  const events = [];
  const notifications = [];
  const pool = {
    connect: async () => { throw new Error("connect should not be used"); },
    query: async (sql, params = []) => {
      events.push({ sql: String(sql), params });
      if (String(sql).startsWith("UPDATE trips SET status = 'driver_arriving'")) {
        return { rowCount: 1, rows: [{ id: "123e4567-e89b-12d3-a456-426614174000", passenger_user_id: "passenger-1", pickup_label: "Pinelands" }] };
      }
      return { rowCount: 1, rows: [] };
    },
  };
  const service = createTripService(pool, { dailyActivationFee: 30 }, null, {
    async sendToUser(userId, payload) { notifications.push({ userId, payload }); },
  });
  const result = await service.markDriverArrived({ id: "driver-1", role: "driver" }, "123e4567-e89b-12d3-a456-426614174000");
  assert.equal(result.status, "driver_arriving");
  assert.equal(notifications[0].userId, "passenger-1");
  assert.ok(events.some((event) => event.sql.includes("driver_arrived_at_pickup")));
});

test("driver can cancel an accepted reward trip before start and reward tickets are released", async () => {
  const calls = [];
  const notifications = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      if (String(sql) === "BEGIN" || String(sql) === "COMMIT" || String(sql) === "ROLLBACK") return { rowCount: 0, rows: [] };
      if (String(sql).startsWith("SELECT id, passenger_user_id, status")) {
        return { rowCount: 1, rows: [{ id: "123e4567-e89b-12d3-a456-426614174000", passenger_user_id: "passenger-1", status: "accepted", reward_redemption: "true" }] };
      }
      if (String(sql).startsWith("UPDATE passenger_reward_redemptions")) return { rowCount: 1, rows: [{ tickets_reserved: 9 }] };
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const pool = { connect: async () => client, query: async () => ({ rows: [] }) };
  const service = createTripService(pool, { dailyActivationFee: 30 }, null, {
    async sendToUser(userId, payload) { notifications.push({ userId, payload }); },
  });
  const result = await service.cancelAcceptedTrip({ id: "driver-1", role: "driver" }, "123e4567-e89b-12d3-a456-426614174000");
  assert.equal(result.status, "cancelled");
  assert.ok(calls.some((call) => call.sql.includes("passenger_reward_accounts")));
  assert.ok(calls.some((call) => call.sql.includes("'driver_cancelled'")));
  assert.equal(notifications[0].userId, "passenger-1");
});

test("driver cannot use pre-start cancellation after a trip has started", async () => {
  const client = {
    async query(sql) {
      if (String(sql) === "BEGIN" || String(sql) === "ROLLBACK") return { rowCount: 0, rows: [] };
      if (String(sql).startsWith("SELECT id, passenger_user_id, status")) {
        return { rowCount: 1, rows: [{ id: "123e4567-e89b-12d3-a456-426614174000", passenger_user_id: "passenger-1", status: "in_progress", reward_redemption: "false" }] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };
  const service = createTripService({ connect: async () => client, query: async () => ({ rows: [] }) }, { dailyActivationFee: 30 });
  await assert.rejects(
    service.cancelAcceptedTrip({ id: "driver-1", role: "driver" }, "123e4567-e89b-12d3-a456-426614174000"),
    /only before the trip has started/i,
  );
});
