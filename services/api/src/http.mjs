import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { calculateFare } from "./fare-calculator.mjs";

const json = (response, status, body) => {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
};

const readJson = async (request, maxBytes = 32_768) => {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (Buffer.byteLength(raw) > maxBytes) {
      const error = new Error("Request body too large");
      error.status = 413;
      throw error;
    }
  }
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch {
    const error = new Error("Invalid JSON body");
    error.status = 400;
    throw error;
  }
};

export const developmentFareConfig = () => ({
  version: process.env.FARE_RULE_VERSION ?? "development-2",
  currency: process.env.FARE_CURRENCY ?? "ZAR",
  baseFare: Number(process.env.FARE_BASE ?? 10),
  perKmRate: Number(process.env.FARE_PER_KM ?? 5),
  perMinuteRate: Number(process.env.FARE_PER_MINUTE ?? 1),
  operatingCostPerKm: Number(process.env.FARE_OPERATING_PER_KM ?? 2),
  platformCommissionRate: Number(process.env.FARE_COMMISSION_RATE ?? 0.1),
  minimumFare: Number(process.env.FARE_MINIMUM ?? 20),
  fuelPricePerLitre: Number(process.env.FARE_FUEL_PRICE_PER_LITRE ?? 24.5),
  vehicleCategories: ["standard", "comfort", "xl"],
  vehicleFuelConsumptionLitresPer100Km: {
    standard: Number(process.env.FARE_FUEL_STANDARD_L100KM ?? 8),
    comfort: Number(process.env.FARE_FUEL_COMFORT_L100KM ?? 9),
    xl: Number(process.env.FARE_FUEL_XL_L100KM ?? 11),
  },
});

export function createAppServer({ fareConfig = developmentFareConfig() } = {}) {
  return createServer(async (request, response) => {
    const requestId = randomUUID();
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (request.method === "GET" && url.pathname === "/health") {
        return json(response, 200, { status: "ok", service: "chaufr-api", requestId });
      }
      if (request.method === "GET" && url.pathname === "/v1") {
        return json(response, 200, {
          service: "chaufr-api",
          version: "0.2.0",
          endpoints: ["GET /health", "GET /v1", "POST /v1/fare-quotes"],
        });
      }
      if (request.method === "POST" && url.pathname === "/v1/fare-quotes") {
        const body = await readJson(request);
        const quote = calculateFare({
          distanceKm: body.distanceKm,
          durationMinutes: body.durationMinutes,
          vehicleCategory: body.vehicleCategory,
        }, fareConfig);
        return json(response, 200, {
          quoteId: randomUUID(),
          status: "estimated",
          expiresInSeconds: 120,
          ...quote,
        });
      }
      return json(response, 404, { error: "Not found", requestId });
    } catch (error) {
      const status = error.status ?? (error instanceof TypeError || error instanceof RangeError ? 400 : 500);
      return json(response, status, {
        error: status >= 500 ? "Internal server error" : error.message,
        requestId,
      });
    }
  });
}
