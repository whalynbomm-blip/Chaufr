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
import { createSafetyService } from "./safety-service.mjs";
import { createMobilityService } from "./mobility-service.mjs";
import { createPaystackService, createDriverVerificationService } from "./financial-identity-service.mjs";

const json = (response, status, body) => {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
};

const readRaw = async (request, maxBytes = 10 * 1024 * 1024) => {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > maxBytes) { const error = new Error("Request body too large"); error.status = 413; throw error; } chunks.push(chunk); }
  return Buffer.concat(chunks);
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
  const ownerService = database ? createOwnerService(database, fareConfig) : null;
  const fcmSender = createFcmSender();
  const pushService = database ? createPushService(database, fcmSender) : null;
  const safetyService = database ? createSafetyService(database) : null;
  const mobilityService = database ? createMobilityService(database, routesService, pushService) : null;
  const tripService = database ? createTripService(database, fareConfig, routesService, pushService) : null;
  const paystackService = database ? createPaystackService(database) : null;
  const verificationService = database ? createDriverVerificationService(database) : null;
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

  const server = createServer(async (request, response) => {
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
            "GET /v1/driver/profile", "POST /v1/driver/vehicles", "PUT /v1/driver/presence", "GET/PUT /v1/driver/advantage-settings",
            "GET /v1/driver/activation", "GET /v1/driver/trips/current", "GET /v1/driver/trips/available",
            "POST /v1/driver/trips/:tripId/accept", "POST /v1/driver/trips/:tripId/decline", "POST /v1/driver/trips/:tripId/start",
            "POST /v1/driver/trips/:tripId/complete", "POST /v1/driver/trips/:tripId/reward-commission-request", "GET /v1/passenger/rewards", "GET /v1/passenger/trips/:tripId/status", "GET /v1/passenger/trips/history", "POST /v1/passenger/trips/:tripId/cancel", "POST /v1/trips",
            "POST /v1/safety/block", "POST /v1/safety/report", "POST /v1/safety/trips/:tripId/sos", "POST /v1/safety/trips/:tripId/share",
            "GET/POST /v1/passenger/scheduled-rides", "POST /v1/passenger/recurring-rides", "GET/DELETE /v1/passenger/trusted-contacts",
            "POST /v1/payments/checkout", "POST /v1/passenger/trips/:tripId/refund-request", "POST /v1/webhooks/paystack", "GET /v1/owner/refunds", "GET /v1/owner/driver-earnings/eligible", "POST /v1/owner/refunds/:id/process", "GET /v1/owner/verification-documents", "PATCH /v1/owner/verification-documents/:id", "POST /v1/owner/reward-commission-requests/:id/pay", "POST /v1/owner/driver-earnings/:tripId/pay", "POST /v1/driver/verification-documents", "PUT /v1/driver/payout-account", "GET /v1/owner/overview", "GET /v1/owner/pricing", "PUT /v1/owner/pricing", "GET /v1/owner/drivers",
            "GET /v1/owner/reward-commission-requests", "PATCH /v1/owner/reward-commission-requests/:requestId", "GET /v1/owner/safety-reports", "PATCH /v1/owner/safety-reports/:reportId", "GET /v1/owner/financial-ledger",
          ],
          database: database ? "connected" : "not_configured",
        });
      }

      if (request.method === "POST" && url.pathname === "/v1/webhooks/paystack") {
        if (!paystackService) return json(response, 503, { error: "Payment services unavailable", requestId });
        const raw = await readRaw(request, 1_000_000);
        const result = await paystackService.handleWebhook(raw, request.headers["paystack-signature"] || request.headers["x-paystack-signature"]);
        return json(response, 200, result);
      }

      if (request.method === "POST" && url.pathname === "/v1/payments/checkout") {
        if (!authService || !paystackService) return json(response, 503, { error: "Payment services unavailable", requestId });
        const token = getBearerToken(request);
        if (!token) return json(response, 401, { error: "Authentication required", requestId });
        const user = await authService.authenticate(token);
        if (!user) return json(response, 401, { error: "Session is invalid or expired", requestId });
        return json(response, 201, await paystackService.createCheckout(user, await readJson(request)));
      }

      if (url.pathname.startsWith("/v1/safety/")) {
        if (!authService || !safetyService || !mobilityService) return json(response, 503, { error: "Safety Shield requires a configured database", requestId });
        const token = getBearerToken(request);
        if (!token) return json(response, 401, { error: "Authentication required", requestId });
        const user = await authService.authenticate(token);
        if (!user) return json(response, 401, { error: "Session is invalid or expired", requestId });
        const sosMatch = /^\/v1\/safety\/trips\/([0-9a-f-]{36})\/sos$/i.exec(url.pathname);
        if (request.method === "POST" && sosMatch) return json(response, 201, await mobilityService.triggerSos(user, sosMatch[1], await readJson(request)));
        const shareMatch = /^\/v1\/safety\/trips\/([0-9a-f-]{36})\/share$/i.exec(url.pathname);
        if (request.method === "POST" && shareMatch) return json(response, 201, await mobilityService.createTripShare(user, shareMatch[1]));
        if (request.method !== "POST" || !["/v1/safety/block", "/v1/safety/report"].includes(url.pathname)) {
          return json(response, 404, { error: "Safety endpoint not found", requestId });
        }
        const body = await readJson(request);
        if (url.pathname === "/v1/safety/block") return json(response, 201, await safetyService.blockParticipant(user, body));
        return json(response, 201, await safetyService.reportParticipant(user, body));
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
        if (request.method === "GET" && url.pathname === "/v1/owner/verification-documents") {
          return json(response, 200, await verificationService.listForOwner(user));
        }
        const docContentMatch = /^\/v1\/owner\/verification-documents\/([0-9a-f-]{36})\/content$/i.exec(url.pathname);
        if (request.method === "GET" && docContentMatch) {
          return json(response, 200, await verificationService.readForOwner(user, docContentMatch[1]));
        }
        const docReviewMatch = /^\/v1\/owner\/verification-documents\/([0-9a-f-]{36})$/i.exec(url.pathname);
        if (request.method === "PATCH" && docReviewMatch) {
          const body = await readJson(request);
          return json(response, 200, await verificationService.review(user, docReviewMatch[1], body.status, body.note));
        }
        if (request.method === "GET" && url.pathname === "/v1/owner/driver-earnings/eligible") {
          const rows = await database.query(
            "SELECT t.id AS trip_id,t.driver_user_id,u.display_name AS driver_name,u.phone_e164,u.email,t.driver_earnings AS amount,t.completed_at, " +
            "COALESCE(a.status,'missing') AS payout_account_status " +
            "FROM trips t JOIN users u ON u.id=t.driver_user_id LEFT JOIN driver_payout_accounts a ON a.driver_user_id=t.driver_user_id " +
            "WHERE t.status='completed' AND t.payment_status='paid' AND COALESCE(t.fare_snapshot->>'rewardRedemption','false')<>'true' " +
            "AND NOT EXISTS (SELECT 1 FROM driver_payouts p WHERE p.source_type='driver_earnings' AND p.source_id=t.id AND p.status IN ('queued','processing','paid')) " +
            "ORDER BY t.completed_at DESC LIMIT 300",
          );
          return json(response, 200, { trips: rows.rows });
        }
        if (request.method === "GET" && url.pathname === "/v1/owner/refunds") {
          const rows = await database.query("SELECT r.id,r.trip_id,r.passenger_user_id,u.display_name AS passenger_name,r.amount_minor,r.currency,r.reason,r.status,r.created_at,r.updated_at FROM payment_refunds r JOIN users u ON u.id=r.passenger_user_id ORDER BY r.created_at DESC LIMIT 300");
          return json(response, 200, { refunds: rows.rows.map(row => ({...row, amount: Number(row.amount_minor)/100})) });
        }
        const refundProcessMatch = /^\/v1\/owner\/refunds\/([0-9a-f-]{36})\/process$/i.exec(url.pathname);
        if (request.method === "POST" && refundProcessMatch) {
          return json(response, 200, await paystackService.requestRefund(user, refundProcessMatch[1]));
        }
        const driverEarningsPayoutMatch = /^\/v1\/owner\/driver-earnings\/([0-9a-f-]{36})\/pay$/i.exec(url.pathname);
        if (request.method === "POST" && driverEarningsPayoutMatch) {
          return json(response, 200, await paystackService.payDriverEarnings(user, driverEarningsPayoutMatch[1]));
        }
        const rewardPayoutMatch = /^\/v1\/owner\/reward-commission-requests\/([0-9a-f-]{36})\/pay$/i.exec(url.pathname);
        if (request.method === "POST" && rewardPayoutMatch) {
          return json(response, 200, await paystackService.payRewardCommission(user, rewardPayoutMatch[1]));
        }
        if (request.method === "GET" && url.pathname === "/v1/owner/safety-reports") {
          return json(response, 200, await ownerService.listSafetyReports(user));
        }
        const safetyReportReviewMatch = /^\/v1\/owner\/safety-reports\/([0-9a-f-]{36})$/i.exec(url.pathname);
        if (request.method === "PATCH" && safetyReportReviewMatch) {
          const body = await readJson(request);
          return json(response, 200, await ownerService.reviewSafetyReport(user, safetyReportReviewMatch[1], body.status));
        }
        if (request.method === "GET" && url.pathname === "/v1/owner/financial-ledger") {
          return json(response, 200, await ownerService.listFinancialLedger(user));
        }
        if (request.method === "GET" && url.pathname === "/v1/owner/overview") {
          return json(response, 200, await ownerService.getOverview(user));
        }
        if (request.method === "GET" && url.pathname === "/v1/owner/drivers") {
          return json(response, 200, await ownerService.listDrivers(user));
        }
        if (request.method === "GET" && url.pathname === "/v1/owner/reward-commission-requests") {
          return json(response, 200, await ownerService.listRewardCommissionRequests(user));
        }
        const rewardCommissionReviewMatch = /^\/v1\/owner\/reward-commission-requests\/([0-9a-f-]{36})$/i.exec(url.pathname);
        if (request.method === "PATCH" && rewardCommissionReviewMatch) {
          const body = await readJson(request);
          return json(response, 200, await ownerService.reviewRewardCommissionRequest(user, rewardCommissionReviewMatch[1], body.status));
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

      if (url.pathname.startsWith("/v1/safety/trips/")) {
        if (!authService || !mobilityService) return json(response, 503, { error: "Safety services require a configured database", requestId });
        const token = getBearerToken(request);
        if (!token) return json(response, 401, { error: "Authentication required", requestId });
        const user = await authService.authenticate(token);
        if (!user) return json(response, 401, { error: "Session is invalid or expired", requestId });
        const sosMatch = /^\/v1\/safety\/trips\/([0-9a-f-]{36})\/sos$/i.exec(url.pathname);
        if (request.method === "POST" && sosMatch) return json(response, 201, await mobilityService.triggerSos(user, sosMatch[1], await readJson(request)));
        const shareMatch = /^\/v1\/safety\/trips\/([0-9a-f-]{36})\/share$/i.exec(url.pathname);
        if (request.method === "POST" && shareMatch) return json(response, 201, await mobilityService.createTripShare(user, shareMatch[1]));
      }

      if (url.pathname.startsWith("/v1/passenger/") && (url.pathname === "/v1/passenger/scheduled-rides" || url.pathname.startsWith("/v1/passenger/recurring-rides") || url.pathname.startsWith("/v1/passenger/scheduled-rides/") || url.pathname.startsWith("/v1/passenger/trusted-contacts"))) {
        if (!authService || !mobilityService) return json(response, 503, { error: "Passenger mobility services require a configured database", requestId });
        const token = getBearerToken(request);
        if (!token) return json(response, 401, { error: "Authentication required", requestId });
        const user = await authService.authenticate(token);
        if (!user) return json(response, 401, { error: "Session is invalid or expired", requestId });
        if (user.role !== "passenger") return json(response, 403, { error: "Passenger account required", requestId });
        if (request.method === "GET" && url.pathname === "/v1/passenger/scheduled-rides") return json(response, 200, await mobilityService.listScheduledRides(user));
        if (request.method === "POST" && url.pathname === "/v1/passenger/scheduled-rides") return json(response, 201, await mobilityService.createScheduledRide(user, await readJson(request)));
        if (request.method === "POST" && url.pathname === "/v1/passenger/recurring-rides") return json(response, 201, await mobilityService.createRecurringRide(user, await readJson(request)));
        if (url.pathname === "/v1/passenger/trusted-contacts") {
          if (request.method === "GET") return json(response, 200, await mobilityService.listTrustedContacts(user));
          if (request.method === "POST") return json(response, 201, await mobilityService.addTrustedContact(user, await readJson(request)));
        }
        const contactMatch = /^\/v1\/passenger\/trusted-contacts\/([0-9a-f-]{36})$/i.exec(url.pathname);
        if (request.method === "DELETE" && contactMatch) return json(response, 200, await mobilityService.deleteTrustedContact(user, contactMatch[1]));
        const scheduleMatch = /^\/v1\/passenger\/scheduled-rides\/([0-9a-f-]{36})$/i.exec(url.pathname);
        if (request.method === "DELETE" && scheduleMatch) return json(response, 200, await mobilityService.cancelSchedule(user, scheduleMatch[1], false));
        const recurringMatch = /^\/v1\/passenger\/recurring-rides\/([0-9a-f-]{36})$/i.exec(url.pathname);
        if (request.method === "DELETE" && recurringMatch) return json(response, 200, await mobilityService.cancelSchedule(user, recurringMatch[1], true));
      }

      const sharedTripMatch = /^\/v1\/shared-trips\/([A-Za-z0-9_-]{32,100})$/i.exec(url.pathname);
      if (request.method === "GET" && sharedTripMatch) {
        if (!mobilityService) return json(response, 503, { error: "Trip sharing requires a configured database", requestId });
        return json(response, 200, await mobilityService.getSharedTrip(sharedTripMatch[1]));
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

        if (request.method === "GET" && url.pathname === "/v1/driver/advantage-settings") {
          return json(response, 200, await driverService.getAdvantageSettings(user));
        }
        if (request.method === "PUT" && url.pathname === "/v1/driver/advantage-settings") {
          return json(response, 200, await driverService.updateAdvantageSettings(user, await readJson(request)));
        }
        if (mobilityService && url.pathname === "/v1/driver/trusted-contacts") {
          if (request.method === "GET") return json(response, 200, await mobilityService.listTrustedContacts(user));
          if (request.method === "POST") return json(response, 201, await mobilityService.addTrustedContact(user, await readJson(request)));
        }
        const driverContactMatch = /^\/v1\/driver\/trusted-contacts\/([0-9a-f-]{36})$/i.exec(url.pathname);
        if (mobilityService && request.method === "DELETE" && driverContactMatch) return json(response, 200, await mobilityService.deleteTrustedContact(user, driverContactMatch[1]));
        if (verificationService && request.method === "POST" && url.pathname === "/v1/driver/verification-documents") {
          return json(response, 201, await verificationService.upload(user, await readJson(request, 9 * 1024 * 1024)));
        }
        if (verificationService && request.method === "GET" && url.pathname === "/v1/driver/verification-documents") {
          return json(response, 200, await verificationService.listForDriver(user));
        }
        if (paystackService && request.method === "PUT" && url.pathname === "/v1/driver/payout-account") {
          return json(response, 200, await paystackService.setPayoutAccount(user, await readJson(request)));
        }
        if (request.method === "GET" && url.pathname === "/v1/driver/profile") {
          return json(response, 200, await driverService.getProfile(user));
        }
        if (request.method === "POST" && url.pathname === "/v1/driver/vehicles") {
          return json(response, 201, await driverService.submitVehicle(user, await readJson(request)));
        }
        if (request.method === "PUT" && url.pathname === "/v1/driver/presence") {
          const presenceBody = await readJson(request);
          const presenceResult = await driverService.setPresence(user, presenceBody);
          if (mobilityService && Number.isFinite(Number(presenceBody.latitude)) && Number.isFinite(Number(presenceBody.longitude))) {
            await mobilityService.evaluateDriverLocation(user, Number(presenceBody.latitude), Number(presenceBody.longitude));
          }
          return json(response, 200, presenceResult);
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
      const passengerRefundRequestMatch = /^\/v1\/passenger\/trips\/([0-9a-f-]{36})\/refund-request$/i.exec(url.pathname);
      if (request.method === "POST" && passengerRefundRequestMatch) {
        if (!authService || !paystackService) return json(response, 503, { error: "Refund services unavailable", requestId });
        const token = getBearerToken(request);
        if (!token) return json(response, 401, { error: "Authentication required", requestId });
        const user = await authService.authenticate(token);
        if (!user) return json(response, 401, { error: "Session is invalid or expired", requestId });
        if (user.role !== "passenger") return json(response, 403, { error: "Passenger account required", requestId });
        const body = await readJson(request);
        return json(response, 201, await paystackService.createRefundRequest(user, passengerRefundRequestMatch[1], body.reason || "Passenger refund request"));
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
        const cancelled = await tripService.cancelPassengerTrip(user, passengerTripCancelMatch[1]);
        const refund = paystackService ? await paystackService.createRefundRequest(user, passengerTripCancelMatch[1]) : { refundRequested: false };
        return json(response, 200, { ...cancelled, ...refund });
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
  server.mobilityService = mobilityService;
  return server;
}
