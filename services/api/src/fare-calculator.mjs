/**
 * Deterministic fare calculation core.
 *
 * Monetary values use the currency's minor unit precision (2 decimal places).
 * The API layer must load fareConfig from trusted server-side storage; never
 * accept client-supplied fare rules as authoritative.
 */
export function calculateFare({ distanceKm, durationMinutes, fuelPricePerLitre, fuelConsumptionLitresPer100Km, vehicleCategory }, fareConfig) {
  const numericInputs = {
    distanceKm,
    durationMinutes,
    fuelPricePerLitre,
    fuelConsumptionLitresPer100Km,
  };

  for (const [name, value] of Object.entries(numericInputs)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new TypeError(`${name} must be a finite non-negative number`);
    }
  }
  if (typeof vehicleCategory !== "string" || !vehicleCategory.trim()) {
    throw new TypeError("vehicleCategory is required");
  }
  if (!fareConfig || typeof fareConfig !== "object") {
    throw new TypeError("fareConfig is required");
  }

  const requiredRates = [
    "baseFare",
    "perKmRate",
    "perMinuteRate",
    "operatingCostPerKm",
    "platformCommissionRate",
    "minimumFare",
  ];
  for (const key of requiredRates) {
    if (!Number.isFinite(fareConfig[key]) || fareConfig[key] < 0) {
      throw new TypeError(`fareConfig.${key} must be a finite non-negative number`);
    }
  }
  if (fareConfig.platformCommissionRate >= 1) {
    throw new RangeError("platformCommissionRate must be less than 1");
  }
  if (fareConfig.vehicleCategories && !fareConfig.vehicleCategories.includes(vehicleCategory)) {
    throw new RangeError("vehicleCategory is not enabled in this fare configuration");
  }

  const fuelLitres = distanceKm * fuelConsumptionLitresPer100Km / 100;
  const fuelCost = fuelLitres * fuelPricePerLitre;
  const distanceCharge = distanceKm * fareConfig.perKmRate;
  const timeCharge = durationMinutes * fareConfig.perMinuteRate;
  const operatingCost = distanceKm * fareConfig.operatingCostPerKm;

  const driverSubtotal = fareConfig.baseFare + distanceCharge + timeCharge + fuelCost + operatingCost;
  const commission = driverSubtotal * fareConfig.platformCommissionRate;
  const beforeMinimum = driverSubtotal + commission;
  const passengerTotal = Math.max(beforeMinimum, fareConfig.minimumFare);
  const minimumFareAdjustment = passengerTotal - beforeMinimum;

  const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
  const roundedSubtotal = roundMoney(driverSubtotal + minimumFareAdjustment / (1 + fareConfig.platformCommissionRate));
  const roundedCommission = roundMoney(passengerTotal - roundedSubtotal);

  return Object.freeze({
    currency: fareConfig.currency ?? "ZAR",
    vehicleCategory,
    distanceKm,
    durationMinutes,
    breakdown: Object.freeze({
      baseFare: roundMoney(fareConfig.baseFare),
      distanceCharge: roundMoney(distanceCharge),
      timeCharge: roundMoney(timeCharge),
      fuelCost: roundMoney(fuelCost),
      operatingCost: roundMoney(operatingCost),
      driverEarnings: roundedSubtotal,
      platformCommission: roundedCommission,
      minimumFareAdjustment: roundMoney(minimumFareAdjustment),
    }),
    passengerTotal: roundMoney(passengerTotal),
    fareRuleVersion: String(fareConfig.version ?? "unversioned"),
  });
}
