import test from "node:test";
import assert from "node:assert/strict";
import { calculateFare } from "./fare-calculator.mjs";

const config = {
  version: "chaufr-schedule-test-1",
  currency: "ZAR",
  baseFare: 10,
  perKmRate: 1,
  perMinuteRate: 0,
  operatingCostPerKm: 2,
  platformCommissionRate: 0.12,
  minimumFare: 40,
  fuelPricePerLitre: 24.5,
  vehicleCategories: ["standard", "comfort", "xl"],
  vehicleFuelConsumptionLitresPer100Km: { standard: 8, comfort: 9, xl: 11 },
  durationFareBands: [
    { maxMinutes: 7, startingFare: 40 },
    { maxMinutes: 15, startingFare: 50 },
    { maxMinutes: 22, startingFare: 85 },
    { maxMinutes: 29, startingFare: 100 },
    { maxMinutes: 39, startingFare: 150 },
    { maxMinutes: 49, startingFare: 170 },
    { maxMinutes: 59, startingFare: 200 },
    { maxMinutes: Number.MAX_SAFE_INTEGER, startingFare: 250 },
  ],
  trafficAdjustmentsByDuration: {
    short: { normal: 0, moderate: 10, heavy: 15, severe: 20 },
    medium: { normal: 0, moderate: 10, heavy: 15, severe: 25 },
    long: { normal: 0, moderate: 10, heavy: 25, severe: 40 },
  },
  vehicleCategoryMultipliers: { standard: 1, comfort: 1.15, xl: 1.3 },
};

const quote = (durationMinutes, trafficLevel = "normal", vehicleCategory = "standard", distanceKm = 2) =>
  calculateFare({ distanceKm, durationMinutes, vehicleCategory, trafficLevel }, config);

test("applies the short journey starting fare", () => {
  assert.equal(quote(7).passengerTotal, 40);
});

test("keeps 10-15 minute fares between R50 and R70 using traffic bands", () => {
  assert.equal(quote(12, "normal").passengerTotal, 50);
  assert.equal(quote(12, "moderate").passengerTotal, 60);
  assert.equal(quote(12, "severe").passengerTotal, 70);
});

test("applies the agreed longer journey starting fares", () => {
  assert.equal(quote(25).passengerTotal, 100);
  assert.equal(quote(30).passengerTotal, 150);
  assert.equal(quote(40).passengerTotal, 170);
  assert.equal(quote(50).passengerTotal, 200);
  assert.equal(quote(60).passengerTotal, 250);
});

test("uses the illustrative 30 minute traffic increases", () => {
  assert.equal(quote(30, "normal").passengerTotal, 150);
  assert.equal(quote(30, "moderate").passengerTotal, 160);
  assert.equal(quote(30, "heavy").passengerTotal, 175);
  assert.equal(quote(30, "severe").passengerTotal, 190);
});

test("deducts the 12 percent commission from the passenger fare", () => {
  const result = quote(30);
  assert.equal(result.breakdown.platformCommission, 18);
  assert.equal(result.breakdown.driverEarnings, 132);
  assert.equal(result.breakdown.driverEarnings + result.breakdown.platformCommission, result.passengerTotal);
});

test("applies category multipliers and distance cost floor", () => {
  assert.ok(quote(30, "normal", "comfort").passengerTotal > quote(30).passengerTotal);
  assert.ok(quote(7, "normal", "standard", 30).passengerTotal > 40);
});

test("rejects traffic levels that are not configured", () => {
  assert.throws(() => quote(30, "gridlock"), /trafficLevel/);
});
