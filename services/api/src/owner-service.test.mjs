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
