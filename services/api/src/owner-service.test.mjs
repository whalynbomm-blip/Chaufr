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

test("owner pricing validation preserves unapproved bands until explicitly approved", () => {
  const defaults = developmentFareConfig();
  const next = validatePricingConfig({}, defaults);
  const provisional = next.durationFareBands.find((band) => band.maxMinutes === 22);
  assert.equal(provisional.startingFare, 85);
  assert.equal(provisional.approved, false);
  const approved = validatePricingConfig({
    durationFareBands: next.durationFareBands.map((band) => band.maxMinutes === 22 ? { ...band, startingFare: 90, approved: true } : band),
  }, defaults);
  assert.equal(approved.durationFareBands.find((band) => band.maxMinutes === 22).approved, true);
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
