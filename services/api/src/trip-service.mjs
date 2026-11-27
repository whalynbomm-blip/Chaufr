import { AuthError } from "./auth-service.mjs";
import { offerTripToNextDriver, declineTripOffer } from "./dispatch-service.mjs";
import { estimateDriverTripProfit } from "./chaufr-advantage.mjs";

const SA_DATE_SQL = "(now() AT TIME ZONE 'Africa/Johannesburg')::date";
const testActivationBypassEnabled = () =>
  process.env.NODE_ENV === "development" && process.env.CHAUFR_TEST_BYPASS_ACTIVATION === "true";
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
  if (testActivationBypassEnabled()) return { status: "test_bypass", operating_date: null };
  const result = await queryable.query(
    "SELECT id, operating_date, amount, currency, paid_at, non_refundable_at " +
    "FROM driver_daily_activations WHERE driver_user_id = $1 AND operating_date = " +
    SA_DATE_SQL + " AND status = 'paid' LIMIT 1",
    [driverUserId],
  );
  return result.rows[0] ?? null;
}

export function createTripService(pool, fareConfig, routesService = null, pushService = null) {
  if (!pool || typeof pool.connect !== "function") throw new TypeError("A PostgreSQL pool is required");
  if (!fareConfig) throw new TypeError("Server fare configuration is required");

  const notify = async (userId, title, body, data) => {
    if (!pushService || !userId) return;
    try { await pushService.sendToUser(userId, { title, body, data }); } catch { /* push delivery must not block trip state changes */ }
  };

  return {
    async getActivationStatus(driver) {
      requireRole(driver, "driver");
      if (testActivationBypassEnabled()) {
        return {
          operatingDate: null,
          amount: fareConfig.dailyActivationFee ?? 30,
          currency: "ZAR",
          status: "test_bypass",
          isPaid: true,
          testBypass: true,
          paidAt: null,
          nonRefundableAt: null,
        };
      }
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
        testBypass: false,
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

    async releaseExpiredRewardReservations(queryable, passengerId) {
      const expired = await queryable.query(
        "SELECT r.trip_id, r.tickets_reserved FROM passenger_reward_redemptions r " +
        "JOIN trips t ON t.id = r.trip_id WHERE r.passenger_user_id = $1 " +
        "AND r.status = 'reserved' AND t.status IN ('requested', 'expired', 'cancelled') " +
        "AND (t.status <> 'requested' OR t.quote_expires_at <= now()) FOR UPDATE OF r",
        [passengerId],
      );
      for (const item of expired.rows) {
        const changed = await queryable.query(
          "UPDATE passenger_reward_redemptions SET status = 'released', updated_at = now() " +
          "WHERE trip_id = $1 AND status = 'reserved' RETURNING tickets_reserved",
          [item.trip_id],
        );
        if (!changed.rowCount) continue;
        const tickets = Number(changed.rows[0].tickets_reserved);
        await queryable.query(
          "INSERT INTO passenger_reward_accounts (passenger_user_id, tickets_balance, updated_at) " +
          "VALUES ($1, $2, now()) ON CONFLICT (passenger_user_id) DO UPDATE SET " +
          "tickets_balance = passenger_reward_accounts.tickets_balance + EXCLUDED.tickets_balance, updated_at = now()",
          [passengerId, tickets],
        );
        await queryable.query(
          "INSERT INTO passenger_reward_ledger (passenger_user_id, trip_id, entry_type, tickets_delta) " +
          "VALUES ($1, $2, 'released', $3) ON CONFLICT (trip_id, entry_type) DO NOTHING",
          [passengerId, item.trip_id, tickets],
        );
      }
    },

    async getPassengerRewards(passenger) {
      requireRole(passenger, "passenger");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await this.releaseExpiredRewardReservations(client, passenger.id);
        const result = await client.query(
          "SELECT tickets_balance, tickets_earned_total FROM passenger_reward_accounts WHERE passenger_user_id = $1",
          [passenger.id],
        );
        const history = await client.query(
          "SELECT l.entry_type, l.tickets_delta, l.created_at, l.trip_id, t.pickup_label, t.destination_label, t.status " +
          "FROM passenger_reward_ledger l JOIN trips t ON t.id = l.trip_id " +
          "WHERE l.passenger_user_id = $1 ORDER BY l.created_at DESC LIMIT 50",
          [passenger.id],
        );
        await client.query("COMMIT");
        return {
          tickets: Number(result.rows[0]?.tickets_balance ?? 0),
          history: history.rows.map((entry) => ({
            tripId: entry.trip_id,
            type: entry.entry_type,
            ticketsDelta: Number(entry.tickets_delta),
            createdAt: entry.created_at,
            pickupLabel: entry.pickup_label,
            destinationLabel: entry.destination_label,
            tripStatus: entry.status,
          })),
          ticketsEarnedTotal: Number(result.rows[0]?.tickets_earned_total ?? 0),
          ticketsRequired: 9,
          ticketsUntilFreeRide: Math.max(0, 9 - Number(result.rows[0]?.tickets_balance ?? 0)),
          eligibleDurationMinutes: { minimum: 5, maximum: 20 },
          rewardName: "Chaufr Rewards",
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async cancelPassengerTrip(passenger, tripId) {
      requireRole(passenger, "passenger");
      if (typeof tripId !== "string" || !/^[0-9a-f-]{36}$/i.test(tripId)) throw new AuthError("Trip ID is invalid");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const tripResult = await client.query(
          "SELECT id, status FROM trips WHERE id = $1 AND passenger_user_id = $2 FOR UPDATE",
          [tripId, passenger.id],
        );
        const trip = tripResult.rows[0];
        const offeredDrivers = await client.query(
          "SELECT DISTINCT driver_user_id FROM trip_offers WHERE trip_id = $1 AND status = 'pending'",
          [tripId],
        );
        if (!trip) throw new AuthError("Trip not found", 404);
        if (trip.status !== "requested") {
          throw new AuthError("Only a ride request that has not yet been accepted can be cancelled here", 409);
        }
        await client.query(
          "UPDATE trips SET status = 'cancelled', cancelled_at = now() WHERE id = $1 AND status = 'requested'",
          [tripId],
        );
        const redemption = await client.query(
          "UPDATE passenger_reward_redemptions SET status = 'released', updated_at = now() " +
          "WHERE trip_id = $1 AND passenger_user_id = $2 AND status = 'reserved' RETURNING tickets_reserved",
          [tripId, passenger.id],
        );
        if (redemption.rowCount) {
          const tickets = Number(redemption.rows[0].tickets_reserved);
          await client.query(
            "INSERT INTO passenger_reward_accounts (passenger_user_id, tickets_balance, updated_at) " +
            "VALUES ($1, $2, now()) ON CONFLICT (passenger_user_id) DO UPDATE SET " +
            "tickets_balance = passenger_reward_accounts.tickets_balance + EXCLUDED.tickets_balance, updated_at = now()",
            [passenger.id, tickets],
          );
          await client.query(
            "INSERT INTO passenger_reward_ledger (passenger_user_id, trip_id, entry_type, tickets_delta) " +
            "VALUES ($1, $2, 'released', $3) ON CONFLICT (trip_id, entry_type) DO NOTHING",
            [passenger.id, tripId, tickets],
          );
        }
        await client.query(
          "INSERT INTO trip_events (trip_id, actor_user_id, event_type, details) VALUES ($1, $2, 'passenger_cancelled', '{}'::jsonb)",
          [tripId, passenger.id],
        );
        await client.query("COMMIT");
        for (const offeredDriver of offeredDrivers.rows) {
          await notify(offeredDriver.driver_user_id, "Chaufr trip cancelled", "The passenger cancelled this ride request.", { type: "trip_cancelled", tripId });
        }
        return { tripId, status: "cancelled", rewardTicketsReleased: redemption.rowCount ? Number(redemption.rows[0].tickets_reserved) : 0 };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getPassengerTripHistory(passenger) {
      requireRole(passenger, "passenger");
      const result = await pool.query(
        "SELECT id, status, payment_status, pickup_label, destination_label, quoted_total, passenger_payable, " +
        "distance_km, duration_minutes, requested_at, accepted_at, started_at, completed_at " +
        "FROM trips WHERE passenger_user_id = $1 ORDER BY requested_at DESC LIMIT 100",
        [passenger.id],
      );
      return result.rows.map((trip) => ({
        tripId: trip.id,
        status: trip.status,
        paymentStatus: trip.payment_status,
        pickupLabel: trip.pickup_label,
        destinationLabel: trip.destination_label,
        quotedFare: Number(trip.quoted_total),
        passengerPayable: Number(trip.passenger_payable ?? trip.quoted_total),
        distanceKm: Number(trip.distance_km),
        durationMinutes: Number(trip.duration_minutes),
        requestedAt: trip.requested_at,
        acceptedAt: trip.accepted_at,
        startedAt: trip.started_at,
        completedAt: trip.completed_at,
      }));
    },

    async getPassengerTripStatus(passenger, tripId) {
      requireRole(passenger, "passenger");
      if (typeof tripId !== "string" || !/^[0-9a-f-]{36}$/i.test(tripId)) throw new AuthError("Trip ID is invalid");
      const result = await pool.query(
        "SELECT t.id, t.status, t.payment_status, t.pickup_label, t.destination_label, t.quoted_total, t.passenger_payable, " +
        "t.distance_km, t.duration_minutes, t.requested_at, t.accepted_at, t.started_at, t.completed_at, t.fare_snapshot->>'encodedPolyline' AS encoded_polyline, t.fare_snapshot->'pickupLocation' AS pickup_location, t.fare_snapshot->'destinationLocation' AS destination_location, " +
        "u.id AS driver_user_id, u.display_name AS driver_name, dp.rating AS driver_rating, v.make AS vehicle_make, v.model AS vehicle_model, " +
        "v.category AS vehicle_category, p.latitude AS driver_latitude, p.longitude AS driver_longitude, " +
        "p.location_accuracy_m, p.last_seen_at " +
        "FROM trips t LEFT JOIN users u ON u.id = t.driver_user_id " +
        "LEFT JOIN driver_profiles dp ON dp.user_id = t.driver_user_id " +
        "LEFT JOIN vehicles v ON v.id = t.vehicle_id " +
        "LEFT JOIN driver_presence p ON p.driver_user_id = t.driver_user_id " +
        "WHERE t.id = $1 AND t.passenger_user_id = $2 LIMIT 1",
        [tripId, passenger.id],
      );
      const trip = result.rows[0];
      if (!trip) throw new AuthError("Trip not found", 404);
      const locationIsRecent = trip.last_seen_at && (Date.now() - new Date(trip.last_seen_at).getTime()) <= 90_000;
      return {
        tripId: trip.id,
        status: trip.status,
        pickupLabel: trip.pickup_label,
        destinationLabel: trip.destination_label,
        passengerPayable: Number(trip.passenger_payable ?? trip.quoted_total),
        distanceKm: Number(trip.distance_km),
        durationMinutes: Number(trip.duration_minutes),
        route: { encodedPolyline: trip.encoded_polyline ?? null, pickup: trip.pickup_location ?? null, destination: trip.destination_location ?? null },
        requestedAt: trip.requested_at,
        acceptedAt: trip.accepted_at,
        startedAt: trip.started_at,
        completedAt: trip.completed_at,
        driver: trip.driver_name ? {
          userId: trip.driver_user_id,
          name: trip.driver_name,
          rating: trip.driver_rating == null ? null : Number(trip.driver_rating),
          vehicle: trip.vehicle_make ? {
            make: trip.vehicle_make,
            model: trip.vehicle_model,
            category: trip.vehicle_category,
          } : null,
          location: locationIsRecent && trip.driver_latitude != null && trip.driver_longitude != null ? {
            latitude: Number(trip.driver_latitude),
            longitude: Number(trip.driver_longitude),
            accuracyMeters: trip.location_accuracy_m == null ? null : Number(trip.location_accuracy_m),
            lastSeenAt: trip.last_seen_at,
          } : null,
        } : null,
      };
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
      const redeemReward = input.redeemReward === true;
      const serviceTier = input.serviceTier ?? "standard";
      if (!["saver", "standard", "priority"].includes(serviceTier)) throw new AuthError("Choose Saver, Standard or Priority", 400);
      if (redeemReward && (durationMinutes < 5 || durationMinutes > 20)) {
        throw new AuthError("A free ride reward can only be used on a journey lasting 5 to 20 minutes", 400);
      }
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
        serviceTier,
        trafficLevel,
        passengerTotal: fare.passengerTotal,
        driverEarnings: fare.breakdown.driverEarnings,
        platformCommission: fare.breakdown.platformCommission,
        breakdown: { ...fare.breakdown },
        rewardRedemption: redeemReward,
        pickupLocation: { latitude: Number(input.origin.latitude), longitude: Number(input.origin.longitude) },
        destinationLocation: { latitude: Number(input.destination.latitude), longitude: Number(input.destination.longitude) },
      };
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await this.releaseExpiredRewardReservations(client, passenger.id);
        if (redeemReward) {
          await client.query(
            "INSERT INTO passenger_reward_accounts (passenger_user_id) VALUES ($1) ON CONFLICT (passenger_user_id) DO NOTHING",
            [passenger.id],
          );
          const balance = await client.query(
            "SELECT tickets_balance FROM passenger_reward_accounts WHERE passenger_user_id = $1 FOR UPDATE",
            [passenger.id],
          );
          if (Number(balance.rows[0]?.tickets_balance ?? 0) < 9) {
            throw new AuthError("You need 9 reward tickets to redeem a free ride", 409);
          }
        }
        const passengerPayable = redeemReward ? 0 : fare.passengerTotal;
        const tripPlatformCommission = redeemReward
          ? Math.round(fare.passengerTotal * 0.05 * 100) / 100
          : fare.breakdown.platformCommission;
        const tripDriverEarnings = redeemReward
          ? Math.round((fare.passengerTotal - tripPlatformCommission) * 100) / 100
          : fare.breakdown.driverEarnings;
        snapshot.driverEarnings = tripDriverEarnings;
        snapshot.platformCommission = tripPlatformCommission;
        snapshot.breakdown.driverEarnings = tripDriverEarnings;
        snapshot.breakdown.platformCommission = tripPlatformCommission;
        const result = await client.query(
          "INSERT INTO trips (passenger_user_id, status, pickup_label, destination_label, distance_km, " +
          "duration_minutes, quoted_total, passenger_payable, driver_earnings, platform_commission, quote_inputs, quote_expires_at, " +
          "traffic_level, fare_snapshot, commission_rate) " +
          "VALUES ($1, 'requested', $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13::jsonb, $14) " +
          "RETURNING id, status, pickup_label, destination_label, distance_km, duration_minutes, quoted_total, passenger_payable, quote_expires_at",
          [passenger.id, pickupLabel, destinationLabel, distanceKm, durationMinutes,
            fare.passengerTotal, passengerPayable, tripDriverEarnings, tripPlatformCommission,
            JSON.stringify(snapshot), quoteExpiresAt, trafficLevel, JSON.stringify(snapshot),
            redeemReward ? 0.05 : fareConfig.platformCommissionRate],
        );
        const trip = result.rows[0];
        if (redeemReward) {
          await client.query(
            "UPDATE passenger_reward_accounts SET tickets_balance = tickets_balance - 9, updated_at = now() WHERE passenger_user_id = $1",
            [passenger.id],
          );
          await client.query(
            "INSERT INTO passenger_reward_ledger (passenger_user_id, trip_id, entry_type, tickets_delta) VALUES ($1, $2, 'redeemed', -9)",
            [passenger.id, trip.id],
          );
          await client.query(
            "INSERT INTO passenger_reward_redemptions (passenger_user_id, trip_id, tickets_reserved, fare_covered, status) VALUES ($1, $2, 9, $3, 'reserved')",
            [passenger.id, trip.id, fare.passengerTotal],
          );
        }
        await client.query("COMMIT");
        const dispatch = await offerTripToNextDriver(pool, trip.id, input.origin, routesService);
        if (dispatch.driverUserId) await notify(dispatch.driverUserId, "New Chaufr trip request", trip.pickup_label + " → " + trip.destination_label, { type: "trip_offer", tripId: trip.id });
        return {
          tripId: trip.id,
          status: trip.status,
          dispatchStatus: dispatch.status,
          dispatchExpiresAt: dispatch.expiresAt ?? null,
          pickupLabel: trip.pickup_label,
          destinationLabel: trip.destination_label,
          distanceKm: Number(trip.distance_km),
          durationMinutes: Number(trip.duration_minutes),
          passengerTotal: Number(trip.passenger_payable),
          regularFare: Number(trip.quoted_total),
          rewardApplied: redeemReward,
          serviceTier,
          rewardTicketsUsed: redeemReward ? 9 : 0,
          currency: fare.currency,
          fareRuleVersion: fare.fareRuleVersion,
          quoteExpiresAt: trip.quote_expires_at,
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getDriverEarnings(driver) {
      requireRole(driver, "driver");
      const summary = await pool.query(
        "SELECT COUNT(*)::int AS lifetime_trips, COALESCE(SUM(driver_earnings),0)::numeric AS lifetime_earnings, " +
        "COUNT(*) FILTER (WHERE completed_at >= ((now() AT TIME ZONE 'Africa/Johannesburg')::date::timestamp AT TIME ZONE 'Africa/Johannesburg'))::int AS today_trips, " +
        "COALESCE(SUM(driver_earnings) FILTER (WHERE completed_at >= ((now() AT TIME ZONE 'Africa/Johannesburg')::date::timestamp AT TIME ZONE 'Africa/Johannesburg')),0)::numeric AS today_earnings, " +
        "COALESCE(SUM(platform_commission),0)::numeric AS lifetime_commission, " +
        "COALESCE(SUM(platform_commission) FILTER (WHERE completed_at >= ((now() AT TIME ZONE 'Africa/Johannesburg')::date::timestamp AT TIME ZONE 'Africa/Johannesburg')),0)::numeric AS today_commission " +
        "FROM trips WHERE driver_user_id=$1 AND status='completed'",
        [driver.id],
      );
      const recent = await pool.query(
        "SELECT id, pickup_label, destination_label, driver_earnings, quoted_total, completed_at, " +
        "COALESCE(fare_snapshot->>'rewardRedemption','false') AS reward_redemption, payment_status " +
        "FROM trips WHERE driver_user_id=$1 AND status='completed' ORDER BY completed_at DESC LIMIT 20",
        [driver.id],
      );
      const row = summary.rows[0] ?? {};
      return {
        todayEarnings: Number(row.today_earnings ?? 0),
        todayTrips: Number(row.today_trips ?? 0),
        lifetimeEarnings: Number(row.lifetime_earnings ?? 0),
        lifetimeTrips: Number(row.lifetime_trips ?? 0),
        todayPlatformCommission: Number(row.today_commission ?? 0),
        lifetimePlatformCommission: Number(row.lifetime_commission ?? 0),
        recentTrips: recent.rows.map((trip) => ({
          tripId: trip.id,
          pickupLabel: trip.pickup_label,
          destinationLabel: trip.destination_label,
          driverEarnings: Number(trip.driver_earnings),
          passengerFare: Number(trip.quoted_total),
          completedAt: trip.completed_at,
          rewardRide: trip.reward_redemption === "true",
          paymentStatus: trip.payment_status,
        })),
      };
    },

    async getCurrentDriverTrip(driver) {
      requireRole(driver, "driver");
      const activation = await hasPaidActivation(pool, driver.id);
      if (!activation) throw activationRequired();
      const result = await pool.query(
        "SELECT t.id, t.passenger_user_id, t.status, t.pickup_label, t.destination_label, t.distance_km, t.duration_minutes, " +
        "t.quoted_total, t.driver_earnings, t.accepted_at, t.started_at, t.fare_snapshot->>'rewardRedemption' AS reward_redemption, " +
        "t.fare_snapshot->>'encodedPolyline' AS encoded_polyline, t.fare_snapshot->'pickupLocation' AS pickup_location, " +
        "t.fare_snapshot->'destinationLocation' AS destination_location, p.latitude AS driver_latitude, p.longitude AS driver_longitude, p.last_seen_at, sr.scheduled_for " +
        "FROM trips t LEFT JOIN scheduled_rides sr ON sr.trip_id=t.id " +
        "LEFT JOIN driver_presence p ON p.driver_user_id=t.driver_user_id " +
        "WHERE t.driver_user_id = $1 AND t.status IN ('accepted', 'in_progress') " +
        "ORDER BY t.accepted_at DESC LIMIT 1",
        [driver.id],
      );
      const trip = result.rows[0];
      return { trip: trip ? {
        tripId: trip.id,
        passengerUserId: trip.passenger_user_id,
        status: trip.status,
        pickupLabel: trip.pickup_label,
        destinationLabel: trip.destination_label,
        distanceKm: Number(trip.distance_km),
        durationMinutes: Number(trip.duration_minutes),
        route: { encodedPolyline: trip.encoded_polyline ?? null, pickup: trip.pickup_location ?? null, destination: trip.destination_location ?? null },
        driverLocation: trip.driver_latitude == null || !trip.last_seen_at || (Date.now() - new Date(trip.last_seen_at).getTime()) > 90_000 ? null : { latitude: Number(trip.driver_latitude), longitude: Number(trip.driver_longitude), lastSeenAt: trip.last_seen_at },
        passengerFare: Number(trip.quoted_total),
        expectedDriverEarnings: Number(trip.driver_earnings),
        rewardRedemption: trip.reward_redemption === "true",
        scheduledFor: trip.scheduled_for ?? null,
        isScheduled: Boolean(trip.scheduled_for),
        acceptedAt: trip.accepted_at,
        startedAt: trip.started_at,
      } : null };
    },

    async listAvailableTrips(driver) {
      requireRole(driver, "driver");
      const activation = await hasPaidActivation(pool, driver.id);
      if (!activation) throw activationRequired();
      const verification = await pool.query("SELECT verification_status FROM driver_profiles WHERE user_id = $1", [driver.id]);
      if (verification.rows[0]?.verification_status !== "verified") throw new AuthError("Your driver profile must be verified before accessing trip requests", 403);
      const presence = await pool.query("SELECT is_online FROM driver_presence WHERE driver_user_id = $1", [driver.id]);
      if (!presence.rows[0]?.is_online) throw new AuthError("Go online to access available trip requests", 403);
      const redispatchable = await pool.query(
        "SELECT DISTINCT t.id, t.fare_snapshot->'pickupLocation' AS pickup_location " +
        "FROM trips t LEFT JOIN trip_offers o ON o.trip_id = t.id AND o.status = 'pending' " +
        "WHERE t.status = 'requested' AND t.driver_user_id IS NULL AND t.quote_expires_at > now() " +
        "AND (o.id IS NULL OR o.expires_at <= now()) ORDER BY t.id LIMIT 25",
      );
      for (const pendingTrip of redispatchable.rows) {
        const dispatch = await offerTripToNextDriver(pool, pendingTrip.id, pendingTrip.pickup_location, routesService);
        if (dispatch.driverUserId) {
          const labels = await pool.query("SELECT pickup_label, destination_label FROM trips WHERE id = $1", [pendingTrip.id]);
          const row = labels.rows[0];
          if (row) await notify(dispatch.driverUserId, "New Chaufr trip request", row.pickup_label + " → " + row.destination_label, { type: "trip_offer", tripId: pendingTrip.id });
        }
      }
      const result = await pool.query(
        "SELECT t.id, t.pickup_label, t.destination_label, t.distance_km, t.duration_minutes, " +
        "t.quoted_total, t.driver_earnings, t.quote_expires_at, t.requested_at, sr.scheduled_for, " +
        "t.fare_snapshot->>'vehicleCategory' AS vehicle_category " +
        "FROM trips t JOIN trip_offers o ON o.trip_id = t.id LEFT JOIN scheduled_rides sr ON sr.trip_id=t.id " +
        "WHERE t.status = 'requested' AND t.driver_user_id IS NULL " +
        "AND o.driver_user_id = $1 AND o.status = 'pending' AND o.expires_at > now() " +
        "AND t.quote_expires_at > now() ORDER BY o.offered_at ASC LIMIT 50",
        [driver.id],
      );
      const advantageSettings = await pool.query(
        "SELECT minimum_net_per_trip, maximum_pickup_distance_km, fuel_price_per_litre, operating_cost_per_km " +
        "FROM driver_advantage_settings WHERE driver_user_id = $1",
        [driver.id],
      );
      const settings = advantageSettings.rows[0] ?? {};
      const vehicle = await pool.query(
        "SELECT fuel_consumption_l_per_100km FROM vehicles WHERE driver_user_id = $1 AND status = 'approved' ORDER BY created_at DESC LIMIT 1",
        [driver.id],
      );
      const consumption = Number(vehicle.rows[0]?.fuel_consumption_l_per_100km ?? 8);
      const fallbackFareRule = await pool.query(
        "SELECT fuel_price_per_litre, operating_cost_per_km FROM fare_rules WHERE is_active = true LIMIT 1",
      );
      const fuelPrice = Number(settings.fuel_price_per_litre ?? fallbackFareRule.rows[0]?.fuel_price_per_litre ?? 0);
      const operatingCost = Number(settings.operating_cost_per_km ?? fallbackFareRule.rows[0]?.operating_cost_per_km ?? 0);
      return {
        activation: { isPaid: true, operatingDate: activation.operating_date },
        trips: result.rows.map((row) => {
          const commissionRate = Number(row.quoted_total) > 0
            ? Math.max(0, Math.min(0.99, (Number(row.quoted_total) - Number(row.driver_earnings)) / Number(row.quoted_total)))
            : 0.12;
          const profit = estimateDriverTripProfit({
            passengerFareZar: Number(row.quoted_total),
            commissionRate,
            tripDistanceKm: Number(row.distance_km),
            pickupDistanceKm: 0,
            fuelConsumptionLPer100Km: consumption,
            fuelPricePerLitreZar: fuelPrice,
            operatingCostPerKmZar: operatingCost,
          });
          const estimatedNet = Number((Number(row.driver_earnings) - profit.estimatedCostZar).toFixed(2));
          return {
            tripId: row.id,
            pickupLabel: row.pickup_label,
            destinationLabel: row.destination_label,
            distanceKm: Number(row.distance_km),
            durationMinutes: Number(row.duration_minutes),
            passengerFare: Number(row.quoted_total),
            expectedDriverEarnings: Number(row.driver_earnings),
            estimatedOperatingCost: profit.estimatedCostZar,
            estimatedNetEarnings: estimatedNet,
            minimumNetPerTrip: Number(settings.minimum_net_per_trip ?? 0),
            vehicleCategory: row.vehicle_category,
            scheduledFor: row.scheduled_for ?? null,
            isScheduled: Boolean(row.scheduled_for),
            expiresAt: row.quote_expires_at,
            requestedAt: row.requested_at,
          };
        }).filter((offer) => offer.estimatedNetEarnings >= offer.minimumNetPerTrip),
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
        const offer = await client.query(
          "SELECT id FROM trip_offers WHERE trip_id = $1 AND driver_user_id = $2 " +
          "AND status = 'pending' AND expires_at > now() FOR UPDATE",
          [tripId, driver.id],
        );
        const offerHistory = await client.query(
          "SELECT 1 FROM trip_offers WHERE trip_id = $1 LIMIT 1",
          [tripId],
        );
        if (!trip || !["requested", "offered"].includes(trip.status) ||
            new Date(trip.quote_expires_at) <= new Date() ||
            (offerHistory.rowCount > 0 && !offer.rowCount)) {
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
          "WHERE id = $1 AND status IN ('requested', 'offered') AND driver_user_id IS NULL " +
          "RETURNING id, quoted_total, driver_earnings, pickup_label, destination_label, accepted_at, fare_locked_at",
          [tripId, driver.id, vehicle.rows[0].id],
        );
        if (!updated.rowCount) throw new AuthError("This trip has already been accepted", 409);
        await client.query(
          "INSERT INTO trip_events (trip_id, actor_user_id, event_type, details) " +
          "VALUES ($1, $2, 'accepted', $3::jsonb)",
          [tripId, driver.id, JSON.stringify({ fareLocked: true })],
        );
        await client.query(
          "UPDATE trip_offers SET status = CASE WHEN driver_user_id = $2 THEN 'accepted' ELSE 'withdrawn' END, responded_at = now() " +
          "WHERE trip_id = $1 AND status = 'pending'",
          [tripId, driver.id],
        );
        await client.query("COMMIT");
        const accepted = updated.rows[0];
        if (pushService) {
          const passenger = await pool.query("SELECT passenger_user_id FROM trips WHERE id = $1", [tripId]);
          await notify(passenger.rows[0]?.passenger_user_id, "Your Chaufr ride is confirmed", "Your driver has accepted your trip.", { type: "trip_accepted", tripId });
        }
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
        if (pushService) {
          const passenger = await pool.query("SELECT passenger_user_id FROM trips WHERE id = $1", [tripId]);
          await notify(passenger.rows[0]?.passenger_user_id, "Your Chaufr trip has started", "Your driver has started the trip.", { type: "trip_started", tripId });
        }
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

    async declineTripOffer(driver, tripId) {
      requireRole(driver, "driver");
      const declined = await declineTripOffer(pool, driver, tripId);
      const trip = await pool.query(
        "SELECT fare_snapshot->'pickupLocation' AS pickup_location FROM trips WHERE id = $1",
        [tripId],
      );
      const dispatch = await offerTripToNextDriver(pool, tripId, trip.rows[0]?.pickup_location, routesService);
      if (dispatch.driverUserId) {
        const labels = await pool.query("SELECT pickup_label, destination_label FROM trips WHERE id = $1", [tripId]);
        const row = labels.rows[0];
        if (row) await notify(dispatch.driverUserId, "New Chaufr trip request", row.pickup_label + " → " + row.destination_label, { type: "trip_offer", tripId });
      }
      return { ...declined, nextDispatchStatus: dispatch.status };
    },

    async requestRewardDriverCommission(driver, tripId) {
      requireRole(driver, "driver");
      if (typeof tripId !== "string" || !/^[0-9a-f-]{36}$/i.test(tripId)) throw new AuthError("Trip ID is invalid");
      const trip = await pool.query(
        "SELECT id, driver_earnings, status, fare_snapshot->>'rewardRedemption' AS reward_redemption " +
        "FROM trips WHERE id = $1 AND driver_user_id = $2 LIMIT 1",
        [tripId, driver.id],
      );
      const row = trip.rows[0];
      if (!row) throw new AuthError("Trip not found", 404);
      if (row.status !== "completed") throw new AuthError("Commission can only be requested after the reward ride is completed", 409);
      if (row.reward_redemption !== "true") throw new AuthError("This trip is not a free-ride reward trip", 400);
      const amount = Math.round(Number(row.driver_earnings) * 50) / 100;
      const result = await pool.query(
        "INSERT INTO reward_driver_commission_requests (trip_id, driver_user_id, amount) " +
        "VALUES ($1, $2, $3) ON CONFLICT (trip_id) DO UPDATE SET trip_id = EXCLUDED.trip_id " +
        "RETURNING id, amount, status, requested_at",
        [tripId, driver.id, amount],
      );
      return {
        tripId,
        requestId: result.rows[0].id,
        amount: Number(result.rows[0].amount),
        status: result.rows[0].status,
        requestedAt: result.rows[0].requested_at,
        message: "Your reward-ride commission request has been recorded for platform review.",
      };
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
          "RETURNING id, quoted_total, driver_earnings, completed_at, commission_earned_at",
          [tripId, driver.id],
        );
        if (!result.rowCount) throw new AuthError("Only the assigned driver can complete an in-progress trip", 409);
        await client.query(
          "INSERT INTO trip_events (trip_id, actor_user_id, event_type) VALUES ($1, $2, 'completed')",
          [tripId, driver.id],
        );
        await client.query(
          "INSERT INTO financial_ledger(trip_id,account_type,direction,amount_minor,source_reference) " +
          "SELECT id,'driver_earnings','credit',round(driver_earnings * 100)::bigint,'trip-earnings:' || id::text " +
          "FROM trips WHERE id=$1 AND payment_status='paid' AND COALESCE(fare_snapshot->>'rewardRedemption','false') <> 'true' " +
          "ON CONFLICT(account_type,source_reference) DO NOTHING",
          [tripId],
        );
        const passenger = await client.query("SELECT passenger_user_id FROM trips WHERE id = $1", [tripId]);
        const passengerId = passenger.rows[0].passenger_user_id;
        await client.query(
          "INSERT INTO passenger_reward_accounts (passenger_user_id, tickets_balance, tickets_earned_total) " +
          "VALUES ($1, 1, 1) ON CONFLICT (passenger_user_id) DO UPDATE SET " +
          "tickets_balance = passenger_reward_accounts.tickets_balance + 1, " +
          "tickets_earned_total = passenger_reward_accounts.tickets_earned_total + 1, updated_at = now()",
          [passengerId],
        );
        await client.query(
          "INSERT INTO passenger_reward_ledger (passenger_user_id, trip_id, entry_type, tickets_delta) " +
          "VALUES ($1, $2, 'earned', 1) ON CONFLICT (trip_id, entry_type) DO NOTHING",
          [passengerId, tripId],
        );
        await client.query(
          "UPDATE passenger_reward_redemptions SET status = 'consumed', updated_at = now() " +
          "WHERE trip_id = $1 AND status = 'reserved'",
          [tripId],
        );
        await client.query("COMMIT");
        const trip = result.rows[0];
        if (pushService) await notify(passengerId, "Your Chaufr trip is complete", "Your trip is complete. Your reward ticket has been added.", { type: "trip_completed", tripId });
        return {
          tripId: trip.id,
          status: "completed",
          passengerFare: Number(trip.quoted_total),
          driverEarnings: Number(trip.driver_earnings),
          completedAt: trip.completed_at,
          commissionRecorded: Boolean(trip.commission_earned_at),
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
