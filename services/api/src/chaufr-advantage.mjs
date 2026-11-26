/**
 * Chaufr Advantage decision engine (v1).
 * FairMatch balances passenger pickup ETA, driver pickup burden, estimated net,
 * and explicit driver preferences. Safety eligibility is a hard gate, never a
 * trade-off against price or speed.
 */
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const safeNum = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

export function estimateDriverTripProfit({
  passengerFareZar, commissionRate = 0.12, tripDistanceKm,
  pickupDistanceKm = 0, fuelConsumptionLPer100Km = 8,
  fuelPricePerLitreZar = 0, operatingCostPerKmZar = 0,
}) {
  const fare = Math.max(0, safeNum(passengerFareZar));
  const commission = clamp(safeNum(commissionRate), 0, 0.99);
  const tripKm = Math.max(0, safeNum(tripDistanceKm));
  const pickupKm = Math.max(0, safeNum(pickupDistanceKm));
  const fuelUse = Math.max(0, safeNum(fuelConsumptionLPer100Km)) / 100;
  const fuelRate = Math.max(0, safeNum(fuelPricePerLitreZar));
  const operating = Math.max(0, safeNum(operatingCostPerKmZar));
  const driverGross = fare * (1 - commission);
  const totalKm = tripKm + pickupKm;
  const estimatedCost = totalKm * (fuelUse * fuelRate + operating);
  return {
    passengerFareZar: Number(fare.toFixed(2)),
    commissionZar: Number((fare * commission).toFixed(2)),
    driverGrossZar: Number(driverGross.toFixed(2)),
    estimatedCostZar: Number(estimatedCost.toFixed(2)),
    estimatedNetZar: Number((driverGross - estimatedCost).toFixed(2)),
    pickupDistanceKm: Number(pickupKm.toFixed(2)),
    totalEstimatedKm: Number(totalKm.toFixed(2)),
  };
}

export function scoreFairMatch(candidate, settings = {}) {
  // Hard eligibility checks: verified, active, vehicle approved, no trip/offer,
  // and safety status must be clear. These can never be outweighed by a score.
  const eligible = candidate?.verified === true &&
    candidate?.activationPaid === true &&
    candidate?.vehicleApproved === true &&
    candidate?.available === true &&
    candidate?.safetyEligible !== false;
  if (!eligible) return { eligible: false, score: -Infinity, reason: "eligibility_or_safety_gate" };

  const pickupEta = Math.max(0, safeNum(candidate.pickupEtaMinutes, 20));
  const pickupKm = Math.max(0, safeNum(candidate.pickupDistanceKm, 20));
  const profit = safeNum(candidate.estimatedNetZar, -100);
  const preferredArea = candidate.preferredAreaMatch === true;
  const safetySignals = Math.max(0, safeNum(candidate.safetySignals));
  const weights = {
    passengerWait: safeNum(settings.passengerWaitWeight, 0.35),
    pickupBurden: safeNum(settings.pickupBurdenWeight, 0.20),
    driverNet: safeNum(settings.driverNetWeight, 0.35),
    preference: safeNum(settings.preferenceWeight, 0.10),
  };
  const total = Object.values(weights).reduce((a,b) => a+b, 0) || 1;
  const normalized = Object.fromEntries(Object.entries(weights).map(([k,v])=>[k,v/total]));
  // Components normalized to bounded 0-100 values.
  const waitScore = 100 - clamp(pickupEta * 5, 0, 100);
  const pickupScore = 100 - clamp(pickupKm * 12, 0, 100);
  const profitScore = clamp((profit + 20) * 1.25, 0, 100);
  const preferenceScore = preferredArea ? 100 : 50;
  // Report safety indicators to driver/passenger/owner; they do not improve rank
  // unless they make a candidate ineligible. Avoid opaque punitive scoring.
  const score = waitScore * normalized.passengerWait +
    pickupScore * normalized.pickupBurden +
    profitScore * normalized.driverNet +
    preferenceScore * normalized.preference;
  return { eligible: true, score: Number(score.toFixed(3)), components: {
    passengerWait: waitScore, pickupBurden: pickupScore,
    driverNet: profitScore, preference: preferenceScore,
    safetySignals,
  }};
}

export function rankFairMatchCandidates(candidates, settings = {}) {
  return (candidates ?? [])
    .map(candidate => ({ candidate, match: scoreFairMatch(candidate, settings) }))
    .filter(row => row.match.eligible)
    .sort((a,b) => b.match.score - a.match.score);
}
