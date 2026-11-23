import test from "node:test";
import assert from "node:assert/strict";
import { calculateFare } from "./fare-calculator.mjs";

const config = {
  version: "test-1",
  currency: "ZAR",
  baseFare: 10,
  perKmRate: 5,
  perMinuteRate: 1,
  operatingCostPerKm: 2,
  platformCommissionRate: 0.1,
  minimumFare: 20,
  fuelPricePerLitre: 25,
  vehicleCategories: ["standard", "comfort", "xl"],
  vehicleFuelConsumptionLitresPer100Km: { standard: 8, comfort: 9, xl: 11 },
};

test("calculates a transparent quote using server-side fuel assumptions", () => {
  const quote = calculateFare({ distanceKm: 10, durationMinutes: 20, vehicleCategory: "standard" }, config);
  assert.equal(quote.currency, "ZAR");
  assert.equal(quote.fareRuleVersion, "test-1");
  assert.equal(quote.breakdown.fuelCost, 20);
  assert.equal(quote.breakdown.driverEarnings + quote.breakdown.platformCommission, quote.passengerTotal);
  assert.equal(quote.passengerTotal, 132);
});

test("uses the configured consumption for the selected vehicle", () => {
  const standard = calculateFare({ distanceKm: 10, durationMinutes: 20, vehicleCategory: "standard" }, config);
  const xl = calculateFare({ distanceKm: 10, durationMinutes: 20, vehicleCategory: "xl" }, config);
  assert.equal(xl.breakdown.fuelCost, 27.5);
  assert.ok(xl.passengerTotal > standard.passengerTotal);
});

test("applies the configured minimum fare", () => {
  const quote = calculateFare({ distanceKm: 0, durationMinutes: 0, vehicleCategory: "standard" }, { ...config, minimumFare: 30 });
  assert.equal(quote.passengerTotal, 30);
});

test("rejects negative or non-finite trip inputs", () => {
  assert.throws(() => calculateFare({ distanceKm: -1, durationMinutes: 10, vehicleCategory: "standard" }, config), /distanceKm/);
});

test("rejects disabled vehicle categories", () => {
  assert.throws(() => calculateFare({ distanceKm: 1, durationMinutes: 1, vehicleCategory: "luxury" }, config), /not enabled/);
});

test("rejects missing server-side fuel assumptions", () => {
  assert.throws(() => calculateFare({ distanceKm: 1, durationMinutes: 1, vehicleCategory: "standard" }, {
    ...config, vehicleFuelConsumptionLitresPer100Km: {},
  }), /fuel consumption/);
});

test("blocks an owner-unapproved journey duration instead of charging the provisional fare", () => {
  const scheduled = {
    ...config,
    durationFareBands: [
      { maxMinutes: 15, startingFare: 50, approved: true },
      { maxMinutes: 22, startingFare: 85, approved: false },
      { maxMinutes: 1440, startingFare: 100, approved: true },
    ],
    trafficAdjustmentsByDuration: {
      short: { normal: 0, moderate: 10, heavy: 15, severe: 20 },
      medium: { normal: 0, moderate: 10, heavy: 15, severe: 20 },
      long: { normal: 0, moderate: 10, heavy: 15, severe: 20 },
    },
    vehicleCategoryMultipliers: { standard: 1, comfort: 1.15, xl: 1.3 },
  };
  assert.throws(
    () => calculateFare({ distanceKm: 4, durationMinutes: 20, vehicleCategory: "standard" }, scheduled),
    /not yet been approved/,
  );
});


test("uses the next approved R100 band after removal of the provisional 16–22 minute band", () => {
  const scheduled = {
    ...config,
    durationFareBands: [
      { maxMinutes: 7, startingFare: 40, approved: true },
      { maxMinutes: 15, startingFare: 50, approved: true },
      { maxMinutes: 29, startingFare: 100, approved: true },
      { maxMinutes: 39, startingFare: 150, approved: true },
      { maxMinutes: 49, startingFare: 170, approved: true },
      { maxMinutes: 59, startingFare: 200, approved: true },
      { maxMinutes: 1440, startingFare: 250, approved: true },
    ],
  };
  const quote = calculateFare({ distanceKm: 4, durationMinutes: 20, vehicleCategory: "standard" }, scheduled);
  assert.equal(quote.breakdown.durationStartingFare, 100);
});
