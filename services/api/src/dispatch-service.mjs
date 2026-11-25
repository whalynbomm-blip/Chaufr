import { AuthError } from "./auth-service.mjs";

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
      "SELECT id, status, driver_user_id, fare_snapshot->>'vehicleCategory' AS vehicle_category " +
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
      `SELECT p.driver_user_id, p.latitude, p.longitude,
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
       WHERE p.is_online = true
         AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
         AND p.last_seen_at >= now() - interval '90 seconds'
         AND dp.verification_status = 'verified'
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
    let rankingMethod = "straight_line_distance";
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
            rankingMethod = "google_routes_traffic_eta";
          }
        }
      } catch {
        // Dispatch must continue if Google Routes is temporarily unavailable.
      }
    }
    rankedCandidates.sort((a, b) => {
      if (rankingMethod === "google_routes_traffic_eta") {
        const aEta = Number.isFinite(a.eta_seconds) ? a.eta_seconds : Number.POSITIVE_INFINITY;
        const bEta = Number.isFinite(b.eta_seconds) ? b.eta_seconds : Number.POSITIVE_INFINITY;
        if (aEta !== bEta) return aEta - bEta;
      }
      return a.distance_km - b.distance_km;
    });
    const selectedCandidate = rankedCandidates[0];

    const offer = await client.query(
      "INSERT INTO trip_offers (trip_id, driver_user_id, status, expires_at) " +
      "VALUES ($1, $2, 'pending', now() + ($3 * interval '1 second')) " +
      "RETURNING id, driver_user_id, expires_at",
      [tripId, selectedCandidate.driver_user_id, OFFER_SECONDS],
    );
    await client.query(
      "INSERT INTO trip_events (trip_id, event_type, details) VALUES ($1, 'dispatch_offered', $2::jsonb)",
      [tripId, JSON.stringify({ driverUserId: offer.rows[0].driver_user_id, distanceKm: selectedCandidate.distance_km, etaSeconds: selectedCandidate.eta_seconds, rankingMethod, expiresAt: offer.rows[0].expires_at })],
    );
    await client.query("COMMIT");
    return {
      status: "offered",
      driverUserId: offer.rows[0].driver_user_id,
      expiresAt: offer.rows[0].expires_at,
      distanceKm: selectedCandidate.distance_km,
      estimatedPickupMinutes: Number.isFinite(selectedCandidate.eta_seconds) ? Math.ceil(selectedCandidate.eta_seconds / 60) : null,
      rankingMethod,
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
