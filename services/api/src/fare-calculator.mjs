/**
 * Deterministic fare calculation core.
 *
 * Route measurements are supplied by the routing service. All monetary rates,
 * fuel price and vehicle consumption assumptions are loaded by the API from
 * trusted server-side configuration, never from the passenger's device.
 */
export function calculateFare({ distanceKm, durationMinutes, vehicleCategory }, fareConfig) {
  for (const [name, value] of Object.entries({ distanceKm, durationMinutes })) {
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
    "baseFare", "perKmRate", "perMinuteRate", "operatingCostPerKm",
    "platformCommissionRate", "minimumFare", "fuelPricePerLitre",
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

  const consumption = fareConfig.vehicleFuelConsumptionLitresPer100Km?.[vehicleCategory];
  if (!Number.isFinite(consumption) || consumption < 0) {
    throw new TypeError(`No valid fuel consumption configured for ${vehicleCategory}`);
  }

  const fuelLitres = distanceKm * consumption / 100;
  const fuelCost = fuelLitres * fareConfig.fuelPricePerLitre;
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
