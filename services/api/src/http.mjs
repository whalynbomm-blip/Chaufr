import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { calculateFare } from "./fare-calculator.mjs";
import { AuthError, createAuthService } from "./auth-service.mjs";
import { createDriverService } from "./driver-service.mjs";

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

export function createAppServer({ fareConfig = developmentFareConfig(), database = null } = {}) {
  const authService = database ? createAuthService(database) : null;
  const driverService = database ? createDriverService(database) : null;
  const authAttempts = new Map();
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
  const getBearerToken = (request) => {
    const header = request.headers.authorization ?? "";
    const match = /^Bearer (chf_[A-Za-z0-9_-]{40,60})$/.exec(header);
    return match?.[1] ?? null;
  };

  return createServer(async (request, response) => {
    const requestId = randomUUID();
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
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
            "GET /health", "GET /v1", "POST /v1/fare-quotes",
            "POST /v1/auth/register", "POST /v1/auth/login",
            "GET /v1/auth/me", "POST /v1/auth/logout",
            "GET /v1/driver/profile", "POST /v1/driver/vehicles", "PUT /v1/driver/presence",
          ],
          database: database ? "connected" : "not_configured",
        });
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
