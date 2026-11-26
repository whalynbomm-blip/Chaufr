import { AuthError } from "./auth-service.mjs";
import { estimateDriverTripProfit, rankFairMatchCandidates } from "./chaufr-advantage.mjs";

const OFFER_SECONDS = 25;

export async function offerTripToNextDriver(pool, tripId, pickup, routesService = null) {
  const latitude = Number(pickup?.latitude);
  const longitude = Number(pickup?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { status: "waiting_for_driver", reason: "pickup_location_unavailable" };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tripResult = await client.query(
      "SELECT id, status, driver_user_id, passenger_user_id, pickup_label, fare_snapshot->>'vehicleCategory' AS vehicle_category, " +
      "quoted_total, driver_earnings, platform_commission, distance_km, " +
      "(SELECT fuel_price_per_litre FROM fare_rules WHERE fare_rules.id = trips.fare_rule_id) AS fuel_price, " +
      "(SELECT operating_cost_per_km FROM fare_rules WHERE fare_rules.id = trips.fare_rule_id) AS operating_cost " +
      "FROM trips WHERE id = $1 FOR UPDATE",
      [tripId],
    );
    const trip = tripResult.rows[0];
    if (!trip || !["requested", "offered"].includes(trip.status) || trip.driver_user_id) {
      await client.query("COMMIT");
      return { status: "not_dispatchable" };
    }

    await client.query(
      "UPDATE trip_offers SET status = 'expired', responded_at = now() " +
      "WHERE trip_id = $1 AND status = 'pending' AND expires_at <= now()",
      [tripId],
    );

    const active = await client.query(
      "SELECT id, driver_user_id, expires_at FROM trip_offers " +
      "WHERE trip_id = $1 AND status = 'pending' AND expires_at > now() LIMIT 1",
      [tripId],
    );
    if (active.rowCount) {
      await client.query("COMMIT");
      return { status: "offered", driverUserId: active.rows[0].driver_user_id, expiresAt: active.rows[0].expires_at };
    }

    const candidate = await client.query(
      `SELECT p.driver_user_id, p.latitude, p.longitude, v.fuel_consumption_l_per_100km,
              COALESCE(ds.minimum_net_per_trip, 0) AS minimum_net_per_trip,
              COALESCE(ds.maximum_pickup_distance_km, 15) AS maximum_pickup_distance_km,
              COALESCE(ds.fuel_price_per_litre, (SELECT fuel_price_per_litre FROM fare_rules WHERE id = (SELECT fare_rule_id FROM trips WHERE id = $4)), 0) AS driver_fuel_price,
              COALESCE(ds.operating_cost_per_km, (SELECT operating_cost_per_km FROM fare_rules WHERE id = (SELECT fare_rule_id FROM trips WHERE id = $4)), 0) AS driver_operating_cost,
              ds.preferred_area_labels,
              (6371 * acos(LEAST(1, GREATEST(-1,
                cos(radians($1)) * cos(radians(p.latitude)) *
                cos(radians(p.longitude) - radians($2)) +
                sin(radians($1)) * sin(radians(p.latitude))
              )))) AS distance_km
       FROM driver_presence p
       JOIN driver_profiles dp ON dp.user_id = p.driver_user_id
       JOIN driver_daily_activations a ON a.driver_user_id = p.driver_user_id
         AND a.operating_date = (now() AT TIME ZONE 'Africa/Johannesburg')::date
         AND a.status = 'paid'
       JOIN vehicles v ON v.driver_user_id = p.driver_user_id
         AND v.status = 'approved' AND v.category = $3
       LEFT JOIN driver_advantage_settings ds ON ds.driver_user_id = p.driver_user_id
       WHERE p.is_online = true
         AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
         AND p.last_seen_at >= now() - interval '90 seconds'
         AND dp.verification_status = 'verified'
         AND NOT EXISTS (
           SELECT 1 FROM user_blocks b
           WHERE (b.blocker_user_id = p.driver_user_id AND b.blocked_user_id = (SELECT passenger_user_id FROM trips WHERE id = $4))
              OR (b.blocker_user_id = (SELECT passenger_user_id FROM trips WHERE id = $4) AND b.blocked_user_id = p.driver_user_id)
         )
         AND NOT EXISTS (
           SELECT 1 FROM trips busy
           WHERE busy.driver_user_id = p.driver_user_id
             AND busy.status IN ('accepted', 'driver_arriving', 'in_progress')
         )
         AND NOT EXISTS (
           SELECT 1 FROM trip_offers prior
           WHERE prior.trip_id = $4 AND prior.driver_user_id = p.driver_user_id
         )
         AND NOT EXISTS (
           SELECT 1 FROM trip_offers busy_offer
           WHERE busy_offer.driver_user_id = p.driver_user_id
             AND busy_offer.status = 'pending'
             AND busy_offer.expires_at > now()
             AND busy_offer.trip_id <> $4
         )
       ORDER BY distance_km ASC
       LIMIT 10
       FOR UPDATE OF p SKIP LOCKED`,
      [latitude, longitude, trip.vehicle_category, tripId],
    );

    if (!candidate.rowCount) {
      await client.query("UPDATE trips SET status = 'requested' WHERE id = $1 AND status = 'offered'", [tripId]);
      await client.query("COMMIT");
      return { status: "waiting_for_driver", reason: "no_eligible_driver" };
    }

    // Start with nearby candidates, then prefer the shortest live traffic-aware
    // driving ETA when the server has a Google Routes key. Distance remains a safe fallback.
    let rankedCandidates = candidate.rows.map((row) => ({
      ...row,
      distance_km: Number(row.distance_km),
      eta_seconds: null,
    }));
    if (routesService?.computeRouteMatrix) {
      try {
        const matrix = await routesService.computeRouteMatrix(
          { latitude, longitude },
          rankedCandidates.map((row) => ({
            latitude: Number(row.latitude),
            longitude: Number(row.longitude),
          })),
        );
        if (Array.isArray(matrix)) {
          for (const item of matrix) {
            const index = Number(item.destinationIndex);
            if (Number.isInteger(index) && rankedCandidates[index] && item.hasRoute) {
              rankedCandidates[index].eta_seconds = Number(item.durationSeconds);
            }
          }
          if (rankedCandidates.some((row) => Number.isFinite(row.eta_seconds))) {
          }
        }
      } catch {
        // Dispatch must continue if Google Routes is temporarily unavailable.
      }
    }
    // FairMatch replaces ETA/distance-only ranking. SQL already enforces
    // verified, paid, approved vehicle, online, and no active trip/offer.
    const fare = Number(trip.quoted_total ?? 0);
    const driverGross = Number(trip.driver_earnings ?? fare);
    const commissionRate = fare > 0
      ? Math.max(0, Math.min(0.99, Number(trip.platform_commission ?? 0) / fare))
      : 0.12;
    const tripKm = Number(trip.distance_km ?? 0);
    const fairMatchRows = rankedCandidates.map((row) => {
      const etaMinutes = Number.isFinite(row.eta_seconds)
        ? row.eta_seconds / 60
        : Math.max(1, row.distance_km * 3);
      const profit = estimateDriverTripProfit({
        passengerFareZar: fare,
        commissionRate,
        tripDistanceKm: tripKm,
        pickupDistanceKm: row.distance_km,
        fuelConsumptionLPer100Km: Number(row.fuel_consumption_l_per_100km ?? 8),
        fuelPricePerLitreZar: Number(row.driver_fuel_price ?? trip.fuel_price ?? 0),
        operatingCostPerKmZar: Number(row.driver_operating_cost ?? trip.operating_cost ?? 0),
      });
      return {
        ...row,
        eta_minutes: etaMinutes,
        pickupEtaMinutes: etaMinutes,
        estimated_net_zar: Number((driverGross - profit.estimatedCostZar).toFixed(2)),
        verified: true,
        activationPaid: true,
        vehicleApproved: true,
        available: true,
        safetyEligible: true,
        preferredAreaMatch: (row.preferred_area_labels ?? []).some((area) => {
          const normalize = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim();
          const preferred = normalize(area);
          const pickupLabel = normalize(trip.pickup_label);
          return preferred.length >= 2 && pickupLabel.includes(preferred);
        }),
        minimumNetPerTrip: Number(row.minimum_net_per_trip ?? 0),
        maximumPickupDistanceKm: Number(row.maximum_pickup_distance_km ?? 15),
      };
    });
    const preferenceEligible = fairMatchRows.filter((row) =>
      row.distance_km <= row.maximumPickupDistanceKm &&
      row.estimated_net_zar >= row.minimumNetPerTrip
    );
    const ranked = rankFairMatchCandidates(preferenceEligible);
    const selectedCandidate = ranked[0]?.candidate ?? null;
    const matchDetails = ranked[0]?.match ?? null;
    const rankingMethod = "chaufr_fairmatch_v1";

    if (!selectedCandidate) {
      await client.query("UPDATE trips SET status = 'requested' WHERE id = $1 AND status = 'offered'", [tripId]);
      await client.query("COMMIT");
      return { status: "waiting_for_driver", reason: "driver_preferences_no_match" };
    }

    const offer = await client.query(
      "INSERT INTO trip_offers (trip_id, driver_user_id, status, expires_at) " +
      "VALUES ($1, $2, 'pending', now() + ($3 * interval '1 second')) " +
      "RETURNING id, driver_user_id, expires_at",
      [tripId, selectedCandidate.driver_user_id, OFFER_SECONDS],
    );
    await client.query(
      "INSERT INTO trip_events (trip_id, event_type, details) VALUES ($1, 'dispatch_offered', $2::jsonb)",
      [tripId, JSON.stringify({ driverUserId: offer.rows[0].driver_user_id, distanceKm: selectedCandidate.distance_km, etaSeconds: selectedCandidate.eta_seconds, estimatedNetZar: selectedCandidate.estimated_net_zar, fairMatchScore: matchDetails?.score, fairMatchComponents: matchDetails?.components, rankingMethod, expiresAt: offer.rows[0].expires_at })],
    );
    await client.query("COMMIT");
    return {
      status: "offered",
      driverUserId: offer.rows[0].driver_user_id,
      expiresAt: offer.rows[0].expires_at,
      distanceKm: selectedCandidate.distance_km,
      estimatedPickupMinutes: Number.isFinite(selectedCandidate.eta_seconds) ? Math.ceil(selectedCandidate.eta_seconds / 60) : null,
      rankingMethod,
      fairMatchScore: matchDetails?.score,
      estimatedNetZar: selectedCandidate.estimated_net_zar,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return { status: "dispatch_in_progress" };
    throw error;
  } finally {
    client.release();
  }
}

export async function declineTripOffer(pool, driver, tripId) {
  if (driver?.role !== "driver") throw new AuthError("Driver account required", 403);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "UPDATE trip_offers SET status = 'declined', responded_at = now() " +
      "WHERE trip_id = $1 AND driver_user_id = $2 AND status = 'pending' AND expires_at > now() " +
      "RETURNING trip_id",
      [tripId, driver.id],
    );
    if (!result.rowCount) throw new AuthError("No active offer was found for this trip", 409);
    await client.query(
      "INSERT INTO trip_events (trip_id, actor_user_id, event_type) VALUES ($1, $2, 'dispatch_declined')",
      [tripId, driver.id],
    );
    await client.query("COMMIT");
    return { tripId, status: "declined" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
