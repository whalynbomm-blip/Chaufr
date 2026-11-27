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

