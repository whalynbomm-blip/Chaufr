import { AuthError } from "./auth-service.mjs";

const SA_DATE_SQL = "(now() AT TIME ZONE 'Africa/Johannesburg')::date";
const activationRequired = () => new AuthError(
  "Pay the daily Chaufr activation fee before going online or accessing trip requests",
  403,
);
function requireRole(user, role) {
  if (user?.role !== role) throw new AuthError(role + " account required", 403);
}
function cleanLabel(value, field) {
  if (typeof value !== "string" || value.trim().length < 2 || value.trim().length > 160) {
    throw new AuthError(field + " must be between 2 and 160 characters");
  }
  return value.trim();
}
async function hasPaidActivation(queryable, driverUserId) {
  const result = await queryable.query(
    "SELECT id, operating_date, amount, currency, paid_at, non_refundable_at " +
    "FROM driver_daily_activations WHERE driver_user_id = $1 AND operating_date = " +
    SA_DATE_SQL + " AND status = 'paid' LIMIT 1",
    [driverUserId],
  );
  return result.rows[0] ?? null;
}

export function createTripService(pool, fareConfig, routesService = null) {
  if (!pool || typeof pool.connect !== "function") throw new TypeError("A PostgreSQL pool is required");
  if (!fareConfig) throw new TypeError("Server fare configuration is required");

  return {
    async getActivationStatus(driver) {
      requireRole(driver, "driver");
      const result = await pool.query(
        "SELECT operating_date, amount, currency, status, paid_at, non_refundable_at " +
        "FROM driver_daily_activations WHERE driver_user_id = $1 AND operating_date = " +
        SA_DATE_SQL + " LIMIT 1",
        [driver.id],
      );
      const activation = result.rows[0] ?? null;
      return {
        operatingDate: activation?.operating_date ?? null,
        amount: fareConfig.dailyActivationFee ?? 30,
        currency: "ZAR",
        status: activation?.status ?? "unpaid",
        isPaid: activation?.status === "paid",
        paidAt: activation?.paid_at ?? null,
        nonRefundableAt: activation?.non_refundable_at ?? null,
      };
    },

    // Call only after a payment provider independently verifies the charge.
    // There is intentionally no driver-controlled payment-confirmation route.
    async recordVerifiedActivationPayment(input) {
      const { driverUserId, operatingDate, amount, currency = "ZAR", provider, providerReference } = input ?? {};
      if (typeof driverUserId !== "string" || !driverUserId) throw new TypeError("driverUserId is required");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(operatingDate ?? "")) throw new TypeError("operatingDate must be YYYY-MM-DD");
      if (amount !== (fareConfig.dailyActivationFee ?? 30) || currency !== "ZAR") throw new AuthError("Daily activation payment amount does not match the current owner-configured fee", 400);
      if (typeof provider !== "string" || !provider.trim() || typeof providerReference !== "string" || !providerReference.trim()) {
        throw new TypeError("Verified payment provider and reference are required");
      }
      const result = await pool.query(
        "INSERT INTO driver_daily_activations " +
        "(driver_user_id, operating_date, amount, currency, status, payment_provider, provider_reference, paid_at, non_refundable_at, updated_at) " +
        "VALUES ($1, $2::date, $5, 'ZAR', 'paid', $3, $4, now(), now(), now()) " +
        "ON CONFLICT (driver_user_id, operating_date) DO UPDATE SET " +
        "status = 'paid', payment_provider = EXCLUDED.payment_provider, " +
        "provider_reference = EXCLUDED.provider_reference, " +
        "paid_at = COALESCE(driver_daily_activations.paid_at, now()), " +
        "non_refundable_at = COALESCE(driver_daily_activations.non_refundable_at, now()), updated_at = now() " +
        "WHERE driver_daily_activations.status <> 'paid' " +
        "OR driver_daily_activations.provider_reference = EXCLUDED.provider_reference " +
        "RETURNING id, operating_date, amount, currency, status, paid_at, non_refundable_at",
        [driverUserId, operatingDate, provider.trim(), providerReference.trim(), fareConfig.dailyActivationFee ?? 30],
      );
      if (!result.rowCount) throw new AuthError("This operating day has already been activated with a different payment reference", 409);
      return result.rows[0];
    },

    async requestTrip(passenger, input = {}) {
      requireRole(passenger, "passenger");
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new AuthError("Invalid trip details");
      const pickupLabel = cleanLabel(input.pickupLabel, "Pickup");
      const destinationLabel = cleanLabel(input.destinationLabel, "Destination");
      if (!routesService) throw new AuthError("Trusted route calculation is not configured", 503);
      const vehicleCategory = input.vehicleCategory;
      const verifiedQuote = routesService.verifyRouteQuote(
        input.routeQuoteToken, input.origin, input.destination, vehicleCategory,
      );
      const route = verifiedQuote.route;
      const fare = verifiedQuote.fare;
      const distanceKm = route.distanceKm;
      const durationMinutes = route.durationMinutes;
      // Route and complete fare are signed by the server and expire after five minutes.
      const trafficLevel = "normal";
      const quoteExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
      const snapshot = {
        pricingMode: fare.pricingMode,
        fareRuleVersion: fare.fareRuleVersion,
        currency: fare.currency,
        distanceKm,
        durationMinutes,
        encodedPolyline: route.encodedPolyline,
        trafficAware: route.trafficAware,
        vehicleCategory,
        trafficLevel,
        passengerTotal: fare.passengerTotal,
        driverEarnings: fare.breakdown.driverEarnings,
        platformCommission: fare.breakdown.platformCommission,
        breakdown: fare.breakdown,
      };
      const result = await pool.query(
        "INSERT INTO trips (passenger_user_id, status, pickup_label, destination_label, distance_km, " +
        "duration_minutes, quoted_total, driver_earnings, platform_commission, quote_inputs, quote_expires_at, " +
        "traffic_level, fare_snapshot, commission_rate) " +
        "VALUES ($1, 'requested', $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12::jsonb, $13) " +
        "RETURNING id, status, pickup_label, destination_label, distance_km, duration_minutes, quoted_total, quote_expires_at",
        [passenger.id, pickupLabel, destinationLabel, distanceKm, durationMinutes,
          fare.passengerTotal, fare.breakdown.driverEarnings, fare.breakdown.platformCommission,
          JSON.stringify(snapshot), quoteExpiresAt, trafficLevel, JSON.stringify(snapshot),
          fareConfig.platformCommissionRate],
      );
      const trip = result.rows[0];
      return {
        tripId: trip.id,
        status: trip.status,
        pickupLabel: trip.pickup_label,
        destinationLabel: trip.destination_label,
        distanceKm: Number(trip.distance_km),
        durationMinutes: Number(trip.duration_minutes),
        passengerTotal: Number(trip.quoted_total),
        currency: fare.currency,
        fareRuleVersion: fare.fareRuleVersion,
        quoteExpiresAt: trip.quote_expires_at,
      };
    },

    async listAvailableTrips(driver) {
      requireRole(driver, "driver");
      const activation = await hasPaidActivation(pool, driver.id);
      if (!activation) throw activationRequired();
      const verification = await pool.query("SELECT verification_status FROM driver_profiles WHERE user_id = $1", [driver.id]);
      if (verification.rows[0]?.verification_status !== "verified") throw new AuthError("Your driver profile must be verified before accessing trip requests", 403);
      const presence = await pool.query("SELECT is_online FROM driver_presence WHERE driver_user_id = $1", [driver.id]);
      if (!presence.rows[0]?.is_online) throw new AuthError("Go online to access available trip requests", 403);
      const result = await pool.query(
        "SELECT t.id, t.pickup_label, t.destination_label, t.distance_km, t.duration_minutes, " +
        "t.quoted_total, t.driver_earnings, t.quote_expires_at, t.requested_at, " +
        "t.fare_snapshot->>'vehicleCategory' AS vehicle_category " +
        "FROM trips t WHERE t.status = 'requested' AND t.driver_user_id IS NULL " +
        "AND t.quote_expires_at > now() ORDER BY t.requested_at ASC LIMIT 50",
      );
      return {
        activation: { isPaid: true, operatingDate: activation.operating_date },
        trips: result.rows.map((row) => ({
          tripId: row.id,
          pickupLabel: row.pickup_label,
          destinationLabel: row.destination_label,
          distanceKm: Number(row.distance_km),
          durationMinutes: Number(row.duration_minutes),
          passengerFare: Number(row.quoted_total),
          expectedDriverEarnings: Number(row.driver_earnings),
          vehicleCategory: row.vehicle_category,
          expiresAt: row.quote_expires_at,
          requestedAt: row.requested_at,
        })),
      };
    },

    async acceptTrip(driver, tripId) {
      requireRole(driver, "driver");
      if (typeof tripId !== "string" || !/^[0-9a-f-]{36}$/i.test(tripId)) throw new AuthError("Trip ID is invalid");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const activation = await hasPaidActivation(client, driver.id);
        if (!activation) throw activationRequired();
        const driverCheck = await client.query(
          "SELECT dp.verification_status, p.is_online FROM driver_profiles dp " +
          "LEFT JOIN driver_presence p ON p.driver_user_id = dp.user_id " +
          "WHERE dp.user_id = $1 FOR UPDATE OF dp",
          [driver.id],
        );
        if (!driverCheck.rowCount || driverCheck.rows[0].verification_status !== "verified") {
          throw new AuthError("Your driver profile must be verified before accepting trips", 403);
        }
        if (!driverCheck.rows[0].is_online) throw new AuthError("You must be online to accept a trip", 403);
        const tripResult = await client.query(
          "SELECT id, status, pickup_label, destination_label, quoted_total, driver_earnings, " +
          "quote_expires_at, fare_snapshot->>'vehicleCategory' AS vehicle_category " +
          "FROM trips WHERE id = $1 FOR UPDATE",
          [tripId],
        );
        const trip = tripResult.rows[0];
        if (!trip || trip.status !== "requested" || new Date(trip.quote_expires_at) <= new Date()) {
          throw new AuthError("This trip is no longer available", 409);
        }
        const vehicle = await client.query(
          "SELECT id FROM vehicles WHERE driver_user_id = $1 AND status = 'approved' AND category = $2 " +
          "ORDER BY created_at DESC LIMIT 1",
          [driver.id, trip.vehicle_category],
        );
        if (!vehicle.rowCount) throw new AuthError("An approved vehicle in the requested category is required", 403);
        const updated = await client.query(
          "UPDATE trips SET status = 'accepted', driver_user_id = $2, vehicle_id = $3, " +
          "accepted_at = now(), fare_locked_at = now() " +
          "WHERE id = $1 AND status = 'requested' AND driver_user_id IS NULL " +
          "RETURNING id, quoted_total, driver_earnings, pickup_label, destination_label, accepted_at, fare_locked_at",
          [tripId, driver.id, vehicle.rows[0].id],
        );
        if (!updated.rowCount) throw new AuthError("This trip has already been accepted", 409);
        await client.query(
          "INSERT INTO trip_events (trip_id, actor_user_id, event_type, details) " +
          "VALUES ($1, $2, 'accepted', $3::jsonb)",
          [tripId, driver.id, JSON.stringify({ fareLocked: true })],
        );
        await client.query("COMMIT");
        const accepted = updated.rows[0];
        return {
          tripId: accepted.id,
          status: "accepted",
          pickupLabel: accepted.pickup_label,
          destinationLabel: accepted.destination_label,
          passengerFare: Number(accepted.quoted_total),
          expectedDriverEarnings: Number(accepted.driver_earnings),
          fareLocked: true,
          acceptedAt: accepted.accepted_at,
          fareLockedAt: accepted.fare_locked_at,
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async startTrip(driver, tripId) {
      requireRole(driver, "driver");
      if (typeof tripId !== "string" || !/^[0-9a-f-]{36}$/i.test(tripId)) throw new AuthError("Trip ID is invalid");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          "UPDATE trips SET status = 'in_progress', started_at = now() " +
          "WHERE id = $1 AND driver_user_id = $2 AND status = 'accepted' " +
          "RETURNING id, pickup_label, destination_label, quoted_total, driver_earnings, started_at",
          [tripId, driver.id],
        );
        if (!result.rowCount) throw new AuthError("Only the assigned driver can start an accepted trip", 409);
        await client.query(
          "INSERT INTO trip_events (trip_id, actor_user_id, event_type) VALUES ($1, $2, 'started')",
          [tripId, driver.id],
        );
        await client.query("COMMIT");
        const trip = result.rows[0];
        return {
          tripId: trip.id,
          status: "in_progress",
          pickupLabel: trip.pickup_label,
          destinationLabel: trip.destination_label,
          passengerFare: Number(trip.quoted_total),
          expectedDriverEarnings: Number(trip.driver_earnings),
          startedAt: trip.started_at,
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async completeTrip(driver, tripId) {
      requireRole(driver, "driver");
      if (typeof tripId !== "string" || !/^[0-9a-f-]{36}$/i.test(tripId)) throw new AuthError("Trip ID is invalid");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          "UPDATE trips SET status = 'completed', completed_at = now(), commission_earned_at = now() " +
          "WHERE id = $1 AND driver_user_id = $2 AND status = 'in_progress' " +
          "RETURNING id, quoted_total, driver_earnings, completed_at",
          [tripId, driver.id],
        );
        if (!result.rowCount) throw new AuthError("Only the assigned driver can complete an in-progress trip", 409);
        await client.query(
          "INSERT INTO trip_events (trip_id, actor_user_id, event_type) VALUES ($1, $2, 'completed')",
          [tripId, driver.id],
        );
        await client.query("COMMIT");
        const trip = result.rows[0];
        return {
          tripId: trip.id,
          status: "completed",
          passengerFare: Number(trip.quoted_total),
          driverEarnings: Number(trip.driver_earnings),
          completedAt: trip.completed_at,
          commissionRecorded: true,
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
