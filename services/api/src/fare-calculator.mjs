/**
 * Central, deterministic Chaufr fare engine.
 *
 * Schedule mode prices the passenger's fixed fare from the configured journey
 * duration bands, traffic adjustment, vehicle class and a server-side
 * distance/fuel/operating-cost floor. The 12% platform commission is included
 * in the displayed passenger fare and deducted from that fare.
 *
 * Legacy mode remains available for older test/configuration callers until
 * their fare rules are migrated.
 */
const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

function validateTrip({ distanceKm, durationMinutes, vehicleCategory }, fareConfig) {
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
  return { consumption };
}

function calculateScheduledFare(trip, fareConfig, consumption) {
  const { distanceKm, durationMinutes, vehicleCategory } = trip;
  const bands = fareConfig.durationFareBands;
  if (!Array.isArray(bands) || bands.length === 0) {
    throw new TypeError("fareConfig.durationFareBands must contain at least one band");
  }
  const sortedBands = [...bands].sort((a, b) => a.maxMinutes - b.maxMinutes);
  const band = sortedBands.find((item) => durationMinutes <= item.maxMinutes) ?? sortedBands.at(-1);
  if (!band || !Number.isFinite(band.startingFare) || band.startingFare < 0) {
    throw new TypeError("A valid duration fare band is required");
  }

  const trafficLevel = trip.trafficLevel ?? "normal";
  const trafficAdjustments = fareConfig.trafficAdjustmentsByDuration?.[
    durationMinutes <= 15 ? "short" : durationMinutes <= 25 ? "medium" : "long"
  ] ?? fareConfig.trafficAdjustments;
  const trafficAdjustment = trafficAdjustments?.[trafficLevel];
  if (!Number.isFinite(trafficAdjustment) || trafficAdjustment < 0) {
    throw new RangeError("trafficLevel is not configured for this fare engine");
  }

  const categoryMultiplier = fareConfig.vehicleCategoryMultipliers?.[vehicleCategory];
  if (!Number.isFinite(categoryMultiplier) || categoryMultiplier < 1) {
    throw new TypeError(`No valid fare multiplier configured for ${vehicleCategory}`);
  }

  const fuelLitres = distanceKm * consumption / 100;
  const fuelCost = fuelLitres * fareConfig.fuelPricePerLitre;
  const distanceCharge = distanceKm * fareConfig.perKmRate;
  const operatingCost = distanceKm * fareConfig.operatingCostPerKm;
  const costRecoveryFloor = fareConfig.baseFare + distanceCharge + fuelCost + operatingCost;
  const scheduledFare = (band.startingFare + trafficAdjustment) * categoryMultiplier;
  const passengerTotal = roundMoney(Math.max(scheduledFare, costRecoveryFloor, fareConfig.minimumFare));

  // Commission is 12% of the passenger fare, not an extra surcharge on top.
  const platformCommission = roundMoney(passengerTotal * fareConfig.platformCommissionRate);
  const driverEarnings = roundMoney(passengerTotal - platformCommission);

  return Object.freeze({
    currency: fareConfig.currency ?? "ZAR",
    vehicleCategory,
    distanceKm,
    durationMinutes,
    trafficLevel,
    breakdown: Object.freeze({
      durationStartingFare: roundMoney(band.startingFare),
      trafficAdjustment: roundMoney(trafficAdjustment * categoryMultiplier),
      vehicleCategoryMultiplier: categoryMultiplier,
      distanceCharge: roundMoney(distanceCharge),
      fuelCost: roundMoney(fuelCost),
      operatingCost: roundMoney(operatingCost),
      costRecoveryFloor: roundMoney(costRecoveryFloor),
      driverEarnings,
      platformCommission,
    }),
    passengerTotal,
    fareRuleVersion: String(fareConfig.version ?? "unversioned"),
    pricingMode: "duration-traffic-v1",
  });
}

function calculateLegacyFare(trip, fareConfig, consumption) {
  const { distanceKm, durationMinutes, vehicleCategory } = trip;
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
    pricingMode: "legacy-cost-plus-v1",
  });
}

export function calculateFare(trip, fareConfig) {
  const { consumption } = validateTrip(trip, fareConfig);
  return Array.isArray(fareConfig.durationFareBands)
    ? calculateScheduledFare(trip, fareConfig, consumption)
    : calculateLegacyFare(trip, fareConfig, consumption);
}
