import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { calculateFare } from "./fare-calculator.mjs";
import { AuthError, createAuthService } from "./auth-service.mjs";
import { createDriverService } from "./driver-service.mjs";
import { createTripService } from "./trip-service.mjs";
import { createOwnerService } from "./owner-service.mjs";
import { createGoogleRoutesService } from "./google-routes.mjs";
import { createPushService } from "./push-service.mjs";
import { createFcmSender } from "./fcm-sender.mjs";

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
  version: process.env.FARE_RULE_VERSION ?? "development-3",
  currency: process.env.FARE_CURRENCY ?? "ZAR",
  baseFare: Number(process.env.FARE_BASE ?? 10),
  perKmRate: Number(process.env.FARE_PER_KM ?? 1),
  perMinuteRate: Number(process.env.FARE_PER_MINUTE ?? 1),
  operatingCostPerKm: Number(process.env.FARE_OPERATING_PER_KM ?? 2),
  platformCommissionRate: Number(process.env.FARE_COMMISSION_RATE ?? 0.12),
  dailyActivationFee: Number(process.env.DAILY_ACTIVATION_FEE ?? 30),
  minimumFare: Number(process.env.FARE_MINIMUM ?? 20),
  fuelPricePerLitre: Number(process.env.FARE_FUEL_PRICE_PER_LITRE ?? 24.5),
  vehicleCategories: ["standard", "comfort", "xl"],
  vehicleFuelConsumptionLitresPer100Km: {
    standard: Number(process.env.FARE_FUEL_STANDARD_L100KM ?? 8),
    comfort: Number(process.env.FARE_FUEL_COMFORT_L100KM ?? 9),
    xl: Number(process.env.FARE_FUEL_XL_L100KM ?? 11),
  },
  durationFareBands: [
    { maxMinutes: 7, startingFare: 40, approved: true },
    { maxMinutes: 15, startingFare: 50, approved: true },
    { maxMinutes: 29, startingFare: 100, approved: true },
    { maxMinutes: 39, startingFare: 150, approved: true },
    { maxMinutes: 49, startingFare: 170, approved: true },
    { maxMinutes: 59, startingFare: 200, approved: true },
    { maxMinutes: 1440, startingFare: 250, approved: true },
  ],
  trafficAdjustmentsByDuration: {
    short: { normal: 0, moderate: 10, heavy: 15, severe: 20 },
    medium: { normal: 0, moderate: 10, heavy: 15, severe: 25 },
    long: { normal: 0, moderate: 10, heavy: 25, severe: 40 },
  },
  vehicleCategoryMultipliers: {
    standard: Number(process.env.FARE_STANDARD_MULTIPLIER ?? 1),
    comfort: Number(process.env.FARE_COMFORT_MULTIPLIER ?? 1.15),
    xl: Number(process.env.FARE_XL_MULTIPLIER ?? 1.3),
  },
});

export function createAppServer({ fareConfig = developmentFareConfig(), database = null, routesService = createGoogleRoutesService() } = {}) {
  const authService = database ? createAuthService(database) : null;
  const driverService = database ? createDriverService(database, undefined, fareConfig) : null;
  const tripService = database ? createTripService(database, fareConfig, routesService) : null;
  const ownerService = database ? createOwnerService(database, fareConfig) : null;
  const fcmSender = createFcmSender();
  const pushService = database ? createPushService(database, fcmSender) : null;
  const authAttempts = new Map();
  const routeAttempts = new Map();
  const checkAuthRateLimit = (request, route) => {
    const key = `${request.socket.remoteAddress ?? "unknown"}:${route}`;
    const now = Date.now();
    const current = authAttempts.get(key);
    if (!current || current.resetAt <= now) {
      authAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
      return;
    }
    if (current.count >= 10) throw new AuthError("Too many attempts. Please try again later.", 429);
    current.count += 1;
  };
  const checkRouteRateLimit = (request) => {
    const key = request.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    const current = routeAttempts.get(key);
    if (!current || current.resetAt <= now) {
      routeAttempts.set(key, { count: 1, resetAt: now + 60 * 1000 });
      return;
    }
    if (current.count >= 30) throw new AuthError("Too many route requests. Please wait a minute and try again.", 429);
    current.count += 1;
  };
  const getBearerToken = (request) => {
    const header = request.headers.authorization ?? "";
    const match = /^Bearer (chf_[A-Za-z0-9_-]{40,60})$/.exec(header);
    return match?.[1] ?? null;
  };

  return createServer(async (request, response) => {
    const requestId = randomUUID();
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (request.method === "GET" && ["/owner", "/owner/"].includes(url.pathname)) {
        const page = await readFile(new URL("../public/owner.html", import.meta.url), "utf8");
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
        response.end(page);
        return;
      }
      if (request.method === "GET" && url.pathname === "/health") {
        if (database) await database.query("SELECT 1");
        return json(response, 200, {
          status: "ok", service: "chaufr-api",
          dependencies: { database: database ? "connected" : "not_configured" },
          requestId,
        });
      }
      if (request.method === "GET" && url.pathname === "/v1") {
        return json(response, 200, {
          service: "chaufr-api",
          version: "0.3.0",
          endpoints: [
            "GET /health", "GET /v1", "POST /v1/fare-quotes", "POST /v1/routes/preview",
            "POST /v1/auth/register", "POST /v1/auth/login",
            "GET /v1/auth/me", "POST /v1/auth/logout", "POST/DELETE /v1/push-devices",
            "GET /v1/driver/profile", "POST /v1/driver/vehicles", "PUT /v1/driver/presence",
            "GET /v1/driver/activation", "GET /v1/driver/trips/current", "GET /v1/driver/trips/available",
            "POST /v1/driver/trips/:tripId/accept", "POST /v1/driver/trips/:tripId/decline", "POST /v1/driver/trips/:tripId/start",
            "POST /v1/driver/trips/:tripId/complete", "POST /v1/driver/trips/:tripId/reward-commission-request", "GET /v1/passenger/rewards", "GET /v1/passenger/trips/:tripId/status", "GET /v1/passenger/trips/history", "POST /v1/passenger/trips/:tripId/cancel", "POST /v1/trips",
            "GET /v1/owner/overview", "GET /v1/owner/pricing", "PUT /v1/owner/pricing", "GET /v1/owner/drivers",
          ],
          database: database ? "connected" : "not_configured",
        });
      }

      if (url.pathname.startsWith("/v1/owner/")) {
        if (!authService || !ownerService) {
          return json(response, 503, { error: "Owner services are unavailable until the database is configured", requestId });
        }
        const token = getBearerToken(request);
        if (!token) return json(response, 401, { error: "Authentication required", requestId });
        const user = await authService.authenticate(token);
        if (!user) return json(response, 401, { error: "Session is invalid or expired", requestId });
        if (user.role !== "owner") return json(response, 403, { error: "Owner access required", requestId });
        if (request.method === "GET" && url.pathname === "/v1/owner/overview") {
          return json(response, 200, await ownerService.getOverview(user));
        }
        if (request.method === "GET" && url.pathname === "/v1/owner/drivers") {
          return json(response, 200, await ownerService.listDrivers(user));
        }
        const driverReviewMatch = /^\/v1\/owner\/drivers\/([0-9a-f-]{36})\/verification$/i.exec(url.pathname);
        if (request.method === "PATCH" && driverReviewMatch) {
          const body = await readJson(request);
          return json(response, 200, await ownerService.setDriverVerification(user, driverReviewMatch[1], body.status));
        }
        const vehicleReviewMatch = /^\/v1\/owner\/vehicles\/([0-9a-f-]{36})\/status$/i.exec(url.pathname);
        if (request.method === "PATCH" && vehicleReviewMatch) {
          const body = await readJson(request);
          return json(response, 200, await ownerService.setVehicleStatus(user, vehicleReviewMatch[1], body.status));
        }
        if (request.method === "GET" && url.pathname === "/v1/owner/pricing") {
          return json(response, 200, await ownerService.getPricing(user));
        }
        if (request.method === "PUT" && url.pathname === "/v1/owner/pricing") {
          return json(response, 200, await ownerService.updatePricing(user, await readJson(request)));
        }
      }

      if (url.pathname === "/v1/push-devices") {
        if (!authService || !pushService) {
          return json(response, 503, { error: "Push-device services are unavailable until the database is configured", requestId });
        }
        const token = getBearerToken(request);
        if (!token) return json(response, 401, { error: "Authentication required", requestId });
        const user = await authService.authenticate(token);
        if (!user) return json(response, 401, { error: "Session is invalid or expired", requestId });
        const body = await readJson(request);
        if (request.method === "POST") return json(response, 200, await pushService.registerDevice(user, body));
        if (request.method === "DELETE") return json(response, 200, await pushService.unregisterDevice(user, body));
      }

      if (url.pathname.startsWith("/v1/driver/")) {
        if (!authService || !driverService) {
          return json(response, 503, { error: "Driver services are unavailable until the database is configured", requestId });
        }
        const token = getBearerToken(request);
        if (!token) return json(response, 401, { error: "Authentication required", requestId });
        const user = await authService.authenticate(token);
        if (!user) return json(response, 401, { error: "Session is invalid or expired", requestId });
        if (user.role !== "driver") return json(response, 403, { error: "Driver account required", requestId });

        if (request.method === "GET" && url.pathname === "/v1/driver/profile") {
          return json(response, 200, await driverService.getProfile(user));
        }
        if (request.method === "POST" && url.pathname === "/v1/driver/vehicles") {
          return json(response, 201, await driverService.submitVehicle(user, await readJson(request)));
        }
        if (request.method === "PUT" && url.pathname === "/v1/driver/presence") {
          return json(response, 200, await driverService.setPresence(user, await readJson(request)));
        }
        if (request.method === "GET" && url.pathname === "/v1/driver/activation") {
          return json(response, 200, await tripService.getActivationStatus(user));
        }
        if (request.method === "GET" && url.pathname === "/v1/driver/trips/current") {
          return json(response, 200, await tripService.getCurrentDriverTrip(user));
        }
        if (request.method === "GET" && url.pathname === "/v1/driver/trips/available") {
          return json(response, 200, await tripService.listAvailableTrips(user));
        }
        const acceptMatch = /^\/v1\/driver\/trips\/([0-9a-f-]{36})\/accept$/i.exec(url.pathname);
        if (request.method === "POST" && acceptMatch) {
          return json(response, 200, await tripService.acceptTrip(user, acceptMatch[1]));
        }
        const declineMatch = /^\/v1\/driver\/trips\/([0-9a-f-]{36})\/decline$/i.exec(url.pathname);
        if (request.method === "POST" && declineMatch) {
          return json(response, 200, await tripService.declineTripOffer(user, declineMatch[1]));
        }
        const startMatch = /^\/v1\/driver\/trips\/([0-9a-f-]{36})\/start$/i.exec(url.pathname);
        if (request.method === "POST" && startMatch) {
          return json(response, 200, await tripService.startTrip(user, startMatch[1]));
        }
        const rewardCommissionMatch = /^\/v1\/driver\/trips\/([0-9a-f-]{36})\/reward-commission-request$/i.exec(url.pathname);
        if (request.method === "POST" && rewardCommissionMatch) {
          return json(response, 200, await tripService.requestRewardDriverCommission(user, rewardCommissionMatch[1]));
        }
        const completeMatch = /^\/v1\/driver\/trips\/([0-9a-f-]{36})\/complete$/i.exec(url.pathname);
        if (request.method === "POST" && completeMatch) {
          return json(response, 200, await tripService.completeTrip(user, completeMatch[1]));
        }
      }

      if (url.pathname.startsWith("/v1/auth/")) {
        if (!authService) {
          return json(response, 503, { error: "Account services are unavailable until the database is configured", requestId });
        }
        if (request.method === "POST" && url.pathname === "/v1/auth/register") {
          checkAuthRateLimit(request, "register");
          const account = await authService.register(await readJson(request));
          return json(response, 201, account);
        }
        if (request.method === "POST" && url.pathname === "/v1/auth/login") {
          checkAuthRateLimit(request, "login");
          const account = await authService.login(await readJson(request));
          return json(response, 200, account);
        }
        if (request.method === "GET" && url.pathname === "/v1/auth/me") {
          const token = getBearerToken(request);
          if (!token) return json(response, 401, { error: "Authentication required", requestId });
          const user = await authService.authenticate(token);
          if (!user) return json(response, 401, { error: "Session is invalid or expired", requestId });
          return json(response, 200, { user });
        }
        if (request.method === "POST" && url.pathname === "/v1/auth/logout") {
          const token = getBearerToken(request);
          if (!token) return json(response, 401, { error: "Authentication required", requestId });
          await authService.logout(token);
          return json(response, 200, { ok: true });
        }
      }
      const passengerTripCancelMatch = /^\/v1\/passenger\/trips\/([0-9a-f-]{36})\/cancel$/i.exec(url.pathname);
      if (request.method === "POST" && passengerTripCancelMatch) {
        if (!authService || !tripService) {
          return json(response, 503, { error: "Passenger trip services are unavailable until the database is configured", requestId });
        }
        const token = getBearerToken(request);
        if (!token) return json(response, 401, { error: "Authentication required", requestId });
        const user = await authService.authenticate(token);
        if (!user) return json(response, 401, { error: "Session is invalid or expired", requestId });
        if (user.role !== "passenger") return json(response, 403, { error: "Passenger account required", requestId });
        return json(response, 200, await tripService.cancelPassengerTrip(user, passengerTripCancelMatch[1]));
      }

      if (request.method === "GET" && url.pathname === "/v1/passenger/trips/history") {
        if (!authService || !tripService) return json(response, 503, { error: "Passenger trip services are unavailable until the database is configured", requestId });
        const token = getBearerToken(request);
        if (!token) return json(response, 401, { error: "Authentication required", requestId });
        const user = await authService.authenticate(token);
        if (!user) return json(response, 401, { error: "Session is invalid or expired", requestId });
        if (user.role !== "passenger") return json(response, 403, { error: "Passenger account required", requestId });
        return json(response, 200, { trips: await tripService.getPassengerTripHistory(user) });
      }

      const passengerTripStatusMatch = /^\/v1\/passenger\/trips\/([0-9a-f-]{36})\/status$/i.exec(url.pathname);
      if (request.method === "GET" && passengerTripStatusMatch) {
        if (!authService || !tripService) {
          return json(response, 503, { error: "Passenger trip services are unavailable until the database is configured", requestId });
        }
        const token = getBearerToken(request);
        if (!token) return json(response, 401, { error: "Authentication required", requestId });
        const user = await authService.authenticate(token);
        if (!user) return json(response, 401, { error: "Session is invalid or expired", requestId });
        if (user.role !== "passenger") return json(response, 403, { error: "Passenger account required", requestId });
        return json(response, 200, await tripService.getPassengerTripStatus(user, passengerTripStatusMatch[1]));
      }

      if (request.method === "GET" && url.pathname === "/v1/passenger/rewards") {
        if (!authService || !tripService) {
          return json(response, 503, { error: "Passenger reward services are unavailable until the database is configured", requestId });
        }
        const token = getBearerToken(request);
        if (!token) return json(response, 401, { error: "Authentication required", requestId });
        const user = await authService.authenticate(token);
        if (!user) return json(response, 401, { error: "Session is invalid or expired", requestId });
        if (user.role !== "passenger") return json(response, 403, { error: "Passenger account required", requestId });
        return json(response, 200, await tripService.getPassengerRewards(user));
      }

      if (request.method === "POST" && url.pathname === "/v1/trips") {
        if (!authService || !tripService) {
          return json(response, 503, { error: "Trip services are unavailable until the database is configured", requestId });
        }
        const token = getBearerToken(request);
        if (!token) return json(response, 401, { error: "Authentication required", requestId });
        const user = await authService.authenticate(token);
        if (!user) return json(response, 401, { error: "Session is invalid or expired", requestId });
        if (user.role !== "passenger") return json(response, 403, { error: "Passenger account required", requestId });
        return json(response, 201, await tripService.requestTrip(user, await readJson(request)));
      }

      if (request.method === "POST" && url.pathname === "/v1/routes/preview") {
        checkRouteRateLimit(request);
        const body = await readJson(request);
        const route = await routesService.computeRoute(body.origin, body.destination);
        const fare = calculateFare({
          distanceKm: route.distanceKm,
          durationMinutes: route.durationMinutes,
          vehicleCategory: body.vehicleCategory,
          trafficLevel: "normal",
        }, fareConfig);
        const quoteToken = routesService.signRouteQuote(body.origin, body.destination, route, {
          vehicleCategory: body.vehicleCategory,
          fare,
        });
        return json(response, 200, { ...route, ...fare, quoteToken, requestId });
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
