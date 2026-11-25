import test from "node:test";
import assert from "node:assert/strict";
import { createOwnerService, validatePricingConfig } from "./owner-service.mjs";
import { developmentFareConfig } from "./http.mjs";

test("owner pricing service rejects driver and passenger roles", async () => {
  const pool = {
    query: async () => { throw new Error("Database must not be queried for a rejected role"); },
    connect: async () => { throw new Error("Database must not be connected for a rejected role"); },
  };
  const service = createOwnerService(pool, developmentFareConfig());
  await assert.rejects(() => service.getPricing({ id: "driver-1", role: "driver" }), (error) => error.status === 403);
  await assert.rejects(() => service.getOverview({ id: "passenger-1", role: "passenger" }), (error) => error.status === 403);
});

test("owner default pricing no longer contains the removed R85 duration band", () => {
  const defaults = developmentFareConfig();
  const next = validatePricingConfig({}, defaults);
  assert.equal(next.durationFareBands.some((band) => band.maxMinutes === 22 || band.startingFare === 85), false);
  assert.deepEqual(next.durationFareBands.map((band) => band.maxMinutes), [7, 15, 29, 39, 49, 59, 1440]);
});

test("owner pricing validation rejects overlapping or out-of-order duration bands", () => {
  const defaults = developmentFareConfig();
  assert.throws(() => validatePricingConfig({
    durationFareBands: [
      { maxMinutes: 15, startingFare: 50, approved: true },
      { maxMinutes: 15, startingFare: 60, approved: true },
      { maxMinutes: 1440, startingFare: 250, approved: true },
    ],
  }, defaults), /strictly increasing/);
});

test("owner pricing validation bounds commission and activation fee", () => {
  const defaults = developmentFareConfig();
  assert.throws(() => validatePricingConfig({ platformCommissionRate: 0.75 }, defaults), /Commission rate/);
  assert.throws(() => validatePricingConfig({ dailyActivationFee: 1001 }, defaults), /Daily activation fee/);
});


test("owner reward payout queue is restricted to owner accounts", async () => {
  const pool = {
    query: async () => { throw new Error("Database must not be queried for a rejected role"); },
    connect: async () => { throw new Error("Database must not be connected for a rejected role"); },
  };
  const service = createOwnerService(pool, developmentFareConfig());
  await assert.rejects(() => service.listRewardCommissionRequests({ id: "driver-1", role: "driver" }), (error) => error.status === 403);
  await assert.rejects(() => service.reviewRewardCommissionRequest({ id: "passenger-1", role: "passenger" }, "00000000-0000-4000-8000-000000000001", "approved"), (error) => error.status === 403);
});

test("owner reward payout review only allows requested-to-approved/rejected and approved-to-paid", async () => {
  const calls = [];
  let currentStatus = "requested";
  const client = {
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.includes("SELECT id, driver_user_id, amount, status")) {
        return { rows: [{ id: "00000000-0000-4000-8000-000000000001", driver_user_id: "driver-1", amount: "47.50", status: currentStatus }] };
      }
      if (sql.includes("UPDATE reward_driver_commission_requests")) {
        currentStatus = params[0];
        return { rows: [{ id: params[1], trip_id: "trip-1", driver_user_id: "driver-1", amount: "47.50", status: currentStatus, requested_at: "2026-11-26T00:00:00Z", updated_at: "2026-11-26T00:01:00Z" }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const pool = { query: async () => ({ rows: [] }), connect: async () => client };
  const service = createOwnerService(pool, developmentFareConfig());
  const owner = { id: "owner-1", role: "owner" };
  const approved = await service.reviewRewardCommissionRequest(owner, "00000000-0000-4000-8000-000000000001", "approved");
  assert.equal(approved.request.status, "approved");
  assert.equal(approved.request.amount, 47.5);
  await assert.rejects(
    () => service.reviewRewardCommissionRequest(owner, "00000000-0000-4000-8000-000000000001", "rejected"),
    (error) => error.status === 409,
  );
  const paid = await service.reviewRewardCommissionRequest(owner, "00000000-0000-4000-8000-000000000001", "paid");
  assert.equal(paid.request.status, "paid");
  assert.equal(calls.filter((call) => call.sql.includes("INSERT INTO audit_events")).length, 2);
});
