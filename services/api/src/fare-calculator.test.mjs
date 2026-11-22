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
  vehicleCategories: ["standard"],
};

test("calculates a transparent quote and reconciles driver earnings plus commission", () => {
  const quote = calculateFare({
    distanceKm: 10,
    durationMinutes: 20,
    fuelPricePerLitre: 25,
    fuelConsumptionLitresPer100Km: 8,
    vehicleCategory: "standard",
  }, config);

  assert.equal(quote.currency, "ZAR");
  assert.equal(quote.fareRuleVersion, "test-1");
  assert.equal(quote.breakdown.fuelCost, 20);
  assert.equal(quote.breakdown.driverEarnings + quote.breakdown.platformCommission, quote.passengerTotal);
  assert.equal(quote.passengerTotal, 120);
});

test("applies the configured minimum fare", () => {
  const quote = calculateFare({
    distanceKm: 0,
    durationMinutes: 0,
    fuelPricePerLitre: 25,
    fuelConsumptionLitresPer100Km: 8,
    vehicleCategory: "standard",
  }, { ...config, minimumFare: 30 });
  assert.equal(quote.passengerTotal, 30);
});

test("rejects negative or non-finite trip inputs", () => {
  assert.throws(() => calculateFare({
    distanceKm: -1,
    durationMinutes: 10,
    fuelPricePerLitre: 25,
    fuelConsumptionLitresPer100Km: 8,
    vehicleCategory: "standard",
  }, config), /distanceKm/);
});

test("rejects disabled vehicle categories", () => {
  assert.throws(() => calculateFare({
    distanceKm: 1,
    durationMinutes: 1,
    fuelPricePerLitre: 25,
    fuelConsumptionLitresPer100Km: 8,
    vehicleCategory: "luxury",
  }, config), /not enabled/);
});
