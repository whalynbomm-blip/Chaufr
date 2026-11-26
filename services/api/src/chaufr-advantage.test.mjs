import test from "node:test";
import assert from "node:assert/strict";
import { estimateDriverTripProfit, scoreFairMatch, rankFairMatchCandidates } from "./chaufr-advantage.mjs";

test("profit estimate includes commission and both pickup and trip operating costs", () => {
  const result = estimateDriverTripProfit({
    passengerFareZar: 100, commissionRate: 0.12, tripDistanceKm: 10,
    pickupDistanceKm: 2, fuelConsumptionLPer100Km: 8,
    fuelPricePerLitreZar: 25, operatingCostPerKmZar: 1,
  });
  assert.equal(result.commissionZar, 12);
  assert.equal(result.driverGrossZar, 88);
  assert.equal(result.totalEstimatedKm, 12);
  assert.equal(result.estimatedCostZar, 36);
  assert.equal(result.estimatedNetZar, 52);
});

test("safety and account eligibility cannot be overridden by an attractive score", () => {
  const ineligible = scoreFairMatch({
    verified: true, activationPaid: true, vehicleApproved: true,
    available: true, safetyEligible: false, estimatedNetZar: 999,
  });
  assert.equal(ineligible.eligible, false);
  assert.equal(ineligible.reason, "eligibility_or_safety_gate");
});

test("FairMatch ranks eligible drivers using both passenger wait and net profit", () => {
  const ranked = rankFairMatchCandidates([
    { id: "quick", verified: true, activationPaid: true, vehicleApproved: true, available: true, pickupEtaMinutes: 3, pickupDistanceKm: 1, estimatedNetZar: 15 },
    { id: "balanced", verified: true, activationPaid: true, vehicleApproved: true, available: true, pickupEtaMinutes: 6, pickupDistanceKm: 2, estimatedNetZar: 60, preferredAreaMatch: true },
  ]);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].candidate.id, "balanced");
});
