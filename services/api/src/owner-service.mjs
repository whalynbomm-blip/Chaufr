import { AuthError } from "./auth-service.mjs";

const clone = (value) => JSON.parse(JSON.stringify(value));
const requireOwner = (user) => {
  if (user?.role !== "owner") throw new AuthError("Owner access required", 403);
};
const finite = (value, name, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new AuthError(name + " must be a number between " + min + " and " + max);
  }
};
export function validatePricingConfig(input, current) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new AuthError("Pricing configuration is required");
  const next = { ...clone(current), ...clone(input) };
  finite(next.platformCommissionRate, "Commission rate", 0, 0.5);
  finite(next.dailyActivationFee, "Daily activation fee", 0, 1000);
  finite(next.fuelPricePerLitre, "Fuel price per litre", 0, 200);
  finite(next.baseFare, "Base fare", 0, 1000);
  finite(next.perKmRate, "Per-kilometre rate", 0, 500);
  finite(next.perMinuteRate, "Per-minute rate", 0, 100);
  finite(next.operatingCostPerKm, "Operating cost per kilometre", 0, 500);
  finite(next.minimumFare, "Minimum fare", 0, 1000);
  if (!Array.isArray(next.durationFareBands) || next.durationFareBands.length < 1 || next.durationFareBands.length > 20) {
    throw new AuthError("Provide between 1 and 20 journey-duration fare bands");
  }
  let previous = 0;
  next.durationFareBands = next.durationFareBands.map((band, index) => {
    if (!band || typeof band !== "object") throw new AuthError("Invalid fare band at position " + (index + 1));
    finite(band.maxMinutes, "Fare band maximum minutes", 1, 1440);
    finite(band.startingFare, "Fare band starting fare", 0, 10000);
    if (band.maxMinutes <= previous) throw new AuthError("Fare bands must be in strictly increasing duration order");
    previous = band.maxMinutes;
    return { maxMinutes: band.maxMinutes, startingFare: band.startingFare, approved: band.approved === true };
  });
  if (previous !== Number.MAX_SAFE_INTEGER && next.durationFareBands.at(-1).maxMinutes < 1440) {
    throw new AuthError("The final fare band must cover journeys up to 24 hours");
  }
  for (const category of ["standard", "comfort", "xl"]) {
    finite(next.vehicleCategoryMultipliers?.[category], category + " vehicle multiplier", 1, 5);
    finite(next.vehicleFuelConsumptionLitresPer100Km?.[category], category + " fuel consumption", 0.1, 60);
  }
  for (const period of ["short", "medium", "long"]) {
    for (const traffic of ["normal", "moderate", "heavy", "severe"]) {
      finite(next.trafficAdjustmentsByDuration?.[period]?.[traffic], period + " " + traffic + " traffic adjustment", 0, 1000);
    }
  }
  next.version = "owner-" + new Date().toISOString();
  next.currency = "ZAR";
  next.vehicleCategories = ["standard", "comfort", "xl"];
  return next;
}

export function createOwnerService(pool, fareConfig) {
  return {
    async getPricing(user) {
      requireOwner(user);
      const result = await pool.query("SELECT config, version, updated_at FROM platform_pricing_settings WHERE singleton = true");
      const saved = result.rows[0];
      return { config: saved?.config ?? fareConfig, version: saved?.version ?? 0, updatedAt: saved?.updated_at ?? null };
    },
    async updatePricing(user, input) {
      requireOwner(user);
      const next = validatePricingConfig(input, fareConfig);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const saved = await client.query(
          "INSERT INTO platform_pricing_settings (singleton, config, version, updated_by, updated_at) " +
          "VALUES (true, $1::jsonb, 1, $2, now()) " +
          "ON CONFLICT (singleton) DO UPDATE SET config = EXCLUDED.config, " +
          "version = platform_pricing_settings.version + 1, updated_by = EXCLUDED.updated_by, updated_at = now() " +
          "RETURNING config, version, updated_at",
          [JSON.stringify(next), user.id],
        );
        await client.query(
          "INSERT INTO audit_events (actor_user_id, action, resource_type, resource_id, details) " +
          "VALUES ($1, 'pricing.updated', 'platform_pricing', 'active', $2::jsonb)",
          [user.id, JSON.stringify({ version: saved.rows[0].version, commissionRate: next.platformCommissionRate, dailyActivationFee: next.dailyActivationFee })],
        );
        await client.query("COMMIT");
        // Keep this API process in sync immediately; database remains the source of truth.
        Object.assign(fareConfig, next);
        return { config: saved.rows[0].config, version: saved.rows[0].version, updatedAt: saved.rows[0].updated_at };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async listDrivers(user) {
      requireOwner(user);
      const result = await pool.query(
        "SELECT u.id, u.display_name, u.email, u.phone_e164, u.status AS account_status, " +
        "dp.verification_status, dp.rating, dp.created_at, " +
        "COALESCE(json_agg(json_build_object('id', v.id, 'category', v.category, 'make', v.make, " +
        "'model', v.model, 'status', v.status, 'fuelConsumption', v.fuel_consumption_l_per_100km)) " +
        "FILTER (WHERE v.id IS NOT NULL), '[]'::json) AS vehicles " +
        "FROM users u JOIN driver_profiles dp ON dp.user_id = u.id " +
        "LEFT JOIN vehicles v ON v.driver_user_id = u.id " +
        "GROUP BY u.id, dp.verification_status, dp.rating, dp.created_at " +
        "ORDER BY dp.created_at DESC LIMIT 250"
      );
      return { drivers: result.rows };
    },
    async setDriverVerification(user, driverId, status) {
      requireOwner(user);
      if (!["verified", "rejected", "suspended"].includes(status)) {
        throw new AuthError("Driver status must be verified, rejected or suspended");
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const updated = await client.query(
          "UPDATE driver_profiles SET verification_status = $1 WHERE user_id = $2 " +
          "RETURNING user_id, verification_status",
          [status, driverId],
        );
        if (!updated.rowCount) throw new AuthError("Driver profile not found", 404);
        await client.query(
          "INSERT INTO audit_events (actor_user_id, action, resource_type, resource_id, details) " +
          "VALUES ($1, 'driver.verification.updated', 'driver', $2, $3::jsonb)",
          [user.id, driverId, JSON.stringify({ verificationStatus: status })],
        );
        if (status !== "verified") {
          await client.query("UPDATE driver_presence SET is_online = false, updated_at = now() WHERE driver_user_id = $1", [driverId]);
        }
        await client.query("COMMIT");
        return { driverId: updated.rows[0].user_id, verificationStatus: updated.rows[0].verification_status };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async setVehicleStatus(user, vehicleId, status) {
      requireOwner(user);
      if (!["approved", "rejected", "inactive"].includes(status)) {
        throw new AuthError("Vehicle status must be approved, rejected or inactive");
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const updated = await client.query(
          "UPDATE vehicles SET status = $1 WHERE id = $2 RETURNING id, driver_user_id, status",
          [status, vehicleId],
        );
        if (!updated.rowCount) throw new AuthError("Vehicle not found", 404);
        await client.query(
          "INSERT INTO audit_events (actor_user_id, action, resource_type, resource_id, details) " +
          "VALUES ($1, 'vehicle.review.updated', 'vehicle', $2, $3::jsonb)",
          [user.id, vehicleId, JSON.stringify({ driverUserId: updated.rows[0].driver_user_id, status })],
        );
        if (status !== "approved") {
          const approved = await client.query(
            "SELECT 1 FROM vehicles WHERE driver_user_id = $1 AND status = 'approved' LIMIT 1",
            [updated.rows[0].driver_user_id],
          );
          if (!approved.rowCount) {
            await client.query("UPDATE driver_presence SET is_online = false, updated_at = now() WHERE driver_user_id = $1", [updated.rows[0].driver_user_id]);
          }
        }
        await client.query("COMMIT");
        return { vehicleId: updated.rows[0].id, driverId: updated.rows[0].driver_user_id, status: updated.rows[0].status };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    async getOverview(user) {
      requireOwner(user);
      const result = await pool.query(
        "SELECT " +
        "(SELECT count(*)::int FROM users WHERE role = 'passenger') AS passengers, " +
        "(SELECT count(*)::int FROM users WHERE role = 'driver') AS drivers, " +
        "(SELECT count(*)::int FROM driver_presence WHERE is_online = true) AS online_drivers, " +
        "(SELECT count(*)::int FROM trips WHERE status IN ('requested','offered','accepted','driver_arriving','in_progress')) AS active_trips, " +
        "(SELECT count(*)::int FROM trips WHERE status = 'completed') AS completed_trips, " +
        "(SELECT COALESCE(sum(platform_commission),0)::numeric(14,2) FROM trips WHERE status = 'completed' AND commission_earned_at IS NOT NULL) AS recognized_commission"
      );
      const row = result.rows[0];
      return {
        passengers: row.passengers,
        drivers: row.drivers,
        onlineDrivers: row.online_drivers,
        activeTrips: row.active_trips,
        completedTrips: row.completed_trips,
        recognizedCommission: Number(row.recognized_commission),
        currency: "ZAR",
      };
    },
  };
}
