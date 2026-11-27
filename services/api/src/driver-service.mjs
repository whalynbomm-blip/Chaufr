import { createCipheriv, randomBytes } from "node:crypto";
import { AuthError } from "./auth-service.mjs";

const categories = new Set(["standard", "comfort", "xl"]);

function encryptSensitiveValue(value, encodedKey) {
  if (!encodedKey) {
    throw new AuthError("Secure vehicle-data encryption is not configured on the server", 503);
  }
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new AuthError("Server vehicle-data encryption key must be a 32-byte base64 value", 503);
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

const cleanText = (value, maxLength) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

export function createDriverService(pool, encryptionKey = process.env.VEHICLE_DATA_ENCRYPTION_KEY, fareConfig = { dailyActivationFee: 30 }) {
  if (!pool || typeof pool.connect !== "function") {
    throw new TypeError("A PostgreSQL pool is required");
  }

  return {
    async getProfile(user) {
      if (user?.role !== "driver") throw new AuthError("Driver account required", 403);
      const profile = await pool.query(
        "SELECT verification_status, rating, created_at FROM driver_profiles WHERE user_id = $1",
        [user.id],
      );
      if (!profile.rowCount) throw new AuthError("Driver profile not found", 404);
      const vehicles = await pool.query(
        `SELECT id, category, make, model, fuel_consumption_l_per_100km,
                status, created_at
         FROM vehicles WHERE driver_user_id = $1 ORDER BY created_at DESC`,
        [user.id],
      );
      const presence = await pool.query(
        "SELECT is_online, last_seen_at FROM driver_presence WHERE driver_user_id = $1",
        [user.id],
      );
      const activation = await pool.query(
        "SELECT operating_date, amount, currency, status, paid_at FROM driver_daily_activations " +
        "WHERE driver_user_id = $1 AND operating_date = (now() AT TIME ZONE 'Africa/Johannesburg')::date LIMIT 1",
        [user.id],
      );
      return {
        verificationStatus: profile.rows[0].verification_status,
        dailyActivation: {
          amount: fareConfig.dailyActivationFee ?? 30,
          currency: "ZAR",
          status: activation.rows[0]?.status ?? "unpaid",
          isPaid: activation.rows[0]?.status === "paid",
          operatingDate: activation.rows[0]?.operating_date ?? null,
          paidAt: activation.rows[0]?.paid_at ?? null,
        },
        rating: profile.rows[0].rating,
        isOnline: presence.rows[0]?.is_online ?? false,
        lastSeenAt: presence.rows[0]?.last_seen_at ?? null,
        vehicles: vehicles.rows,
      };
    },

    async submitVehicle(user, input = {}) {
      if (user?.role !== "driver") throw new AuthError("Driver account required", 403);
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new AuthError("Invalid vehicle details");
      }
      const category = input.category;
      const make = cleanText(input.make, 60);
      const model = cleanText(input.model, 60);
      const registration = cleanText(input.registration, 16).toUpperCase();
      const licenceNumber = cleanText(input.licenceNumber, 32);
      const consumption = Number(input.fuelConsumptionLitresPer100Km);

      if (!categories.has(category)) throw new AuthError("Choose Standard, Comfort or XL");
      if (!make || !model) throw new AuthError("Vehicle make and model are required");
      if (!/^[A-Z0-9 -]{4,16}$/.test(registration)) throw new AuthError("Enter a valid vehicle registration");
      if (!/^[A-Za-z0-9 /-]{6,32}$/.test(licenceNumber)) throw new AuthError("Enter a valid driver licence number");
      if (!Number.isFinite(consumption) || consumption < 1 || consumption > 30) {
        throw new AuthError("Fuel consumption must be between 1 and 30 litres per 100 km");
      }

      const registrationEncrypted = encryptSensitiveValue(registration, encryptionKey);
      const licenceEncrypted = encryptSensitiveValue(licenceNumber, encryptionKey);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const profile = await client.query(
          "SELECT verification_status FROM driver_profiles WHERE user_id = $1 FOR UPDATE",
          [user.id],
        );
        if (!profile.rowCount) throw new AuthError("Driver profile not found", 404);
        const inserted = await client.query(
          `INSERT INTO vehicles
            (driver_user_id, category, make, model, registration_encrypted, fuel_consumption_l_per_100km)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, category, make, model, fuel_consumption_l_per_100km, status, created_at`,
          [user.id, category, make, model, registrationEncrypted, consumption],
        );
        await client.query(
          "UPDATE driver_profiles SET licence_number_encrypted = $1, verification_status = 'in_review' WHERE user_id = $2",
          [licenceEncrypted, user.id],
        );
        await client.query("COMMIT");
        return { vehicle: inserted.rows[0], verificationStatus: "in_review" };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async getAdvantageSettings(user) {
      if (user?.role !== "driver") throw new AuthError("Driver account required", 403);
      const result = await pool.query(
        "SELECT preferred_area_labels, minimum_net_per_trip, maximum_pickup_distance_km, " +
        "fuel_price_per_litre, operating_cost_per_km, updated_at " +
        "FROM driver_advantage_settings WHERE driver_user_id = $1",
        [user.id],
      );
      const row = result.rows[0] ?? {};
      return {
        preferredAreaLabels: row.preferred_area_labels ?? [],
        minimumNetPerTrip: Number(row.minimum_net_per_trip ?? 0),
        maximumPickupDistanceKm: Number(row.maximum_pickup_distance_km ?? 15),
        fuelPricePerLitre: Number(row.fuel_price_per_litre ?? 0),
        operatingCostPerKm: Number(row.operating_cost_per_km ?? 0),
        updatedAt: row.updated_at ?? null,
      };
    },

    async updateAdvantageSettings(user, input = {}) {
      if (user?.role !== "driver") throw new AuthError("Driver account required", 403);
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new AuthError("Settings must be an object");
      const areas = input.preferredAreaLabels ?? [];
      if (!Array.isArray(areas) || areas.length > 20 ||
          areas.some((area) => typeof area !== "string" || area.trim().length < 1 || area.trim().length > 80)) {
        throw new AuthError("preferredAreaLabels must contain up to 20 area names (1–80 characters each)");
      }
      const minimumNet = Number(input.minimumNetPerTrip ?? 0);
      const maxPickup = Number(input.maximumPickupDistanceKm ?? 15);
      const fuelPrice = Number(input.fuelPricePerLitre ?? 0);
      const operatingCost = Number(input.operatingCostPerKm ?? 0);
      if (!Number.isFinite(minimumNet) || minimumNet < 0 || minimumNet > 10000) throw new AuthError("minimumNetPerTrip must be between 0 and R10000");
      if (!Number.isFinite(maxPickup) || maxPickup < 0 || maxPickup > 100) throw new AuthError("maximumPickupDistanceKm must be between 0 and 100");
      if (!Number.isFinite(fuelPrice) || fuelPrice < 0 || fuelPrice > 1000) throw new AuthError("fuelPricePerLitre must be between 0 and R1000");
      if (!Number.isFinite(operatingCost) || operatingCost < 0 || operatingCost > 1000) throw new AuthError("operatingCostPerKm must be between 0 and R1000");
      const result = await pool.query(
        `INSERT INTO driver_advantage_settings
          (driver_user_id, preferred_area_labels, minimum_net_per_trip,
           maximum_pickup_distance_km, fuel_price_per_litre, operating_cost_per_km, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (driver_user_id) DO UPDATE SET
          preferred_area_labels = EXCLUDED.preferred_area_labels,
          minimum_net_per_trip = EXCLUDED.minimum_net_per_trip,
          maximum_pickup_distance_km = EXCLUDED.maximum_pickup_distance_km,
          fuel_price_per_litre = EXCLUDED.fuel_price_per_litre,
          operating_cost_per_km = EXCLUDED.operating_cost_per_km,
          updated_at = now()
         RETURNING preferred_area_labels, minimum_net_per_trip, maximum_pickup_distance_km,
                   fuel_price_per_litre, operating_cost_per_km, updated_at`,
        [user.id, areas.map((area) => area.trim()), minimumNet, maxPickup, fuelPrice, operatingCost],
      );
      const row = result.rows[0];
      return {
        preferredAreaLabels: row.preferred_area_labels,
        minimumNetPerTrip: Number(row.minimum_net_per_trip),
        maximumPickupDistanceKm: Number(row.maximum_pickup_distance_km),
        fuelPricePerLitre: Number(row.fuel_price_per_litre),
        operatingCostPerKm: Number(row.operating_cost_per_km),
        updatedAt: row.updated_at,
      };
    },

    async setPresence(user, input = {}) {
      if (user?.role !== "driver") throw new AuthError("Driver account required", 403);
      if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.isOnline !== "boolean") {
        throw new AuthError("isOnline must be true or false");
      }
      const profile = await pool.query(
        "SELECT verification_status FROM driver_profiles WHERE user_id = $1",
        [user.id],
      );
      if (!profile.rowCount) throw new AuthError("Driver profile not found", 404);

      const latitude = input.latitude == null ? null : Number(input.latitude);
      const longitude = input.longitude == null ? null : Number(input.longitude);
      const accuracy = input.accuracyMeters == null ? null : Number(input.accuracyMeters);
      if (input.isOnline) {
        const activation = await pool.query(
          "SELECT 1 FROM driver_daily_activations " +
          "WHERE driver_user_id = $1 AND operating_date = (now() AT TIME ZONE 'Africa/Johannesburg')::date " +
          "AND status = 'paid' LIMIT 1",
          [user.id],
        );
        if (!activation.rowCount) {
          throw new AuthError("Pay the R" + Number(fareConfig.dailyActivationFee ?? 30).toFixed(2) + " daily Chaufr activation fee before going online or accessing trip requests", 403);
        }
        if (profile.rows[0].verification_status !== "verified") {
          throw new AuthError("Your driver profile must be manually approved before going online", 403);
        }
        const expiredDocuments = await pool.query(
          "SELECT count(*) AS missing_or_expired FROM (VALUES " +
          "('prdp'),('saps_criminal_record'),('pending_investigation_declaration'),('vehicle_registration'),('vehicle_roadworthy'),('vehicle_operating_licence')) AS req(document_type) " +
          "WHERE NOT EXISTS (SELECT 1 FROM driver_verification_documents d WHERE d.driver_user_id=$1 AND d.document_type=req.document_type AND d.status='approved' " +
          "AND (d.document_type NOT IN ('prdp','vehicle_roadworthy','vehicle_operating_licence') OR d.expiry_date > CURRENT_DATE))",
          [user.id],
        );
        if (Number(expiredDocuments.rows[0]?.missing_or_expired ?? 1) > 0) {
          await pool.query("UPDATE driver_presence SET is_online=false,updated_at=now() WHERE driver_user_id=$1", [user.id]);
          throw new AuthError("A required driver document is missing or expired. Update it and wait for owner approval.", 403);
        }
        const approved = await pool.query(
          "SELECT 1 FROM vehicles WHERE driver_user_id = $1 AND status = 'approved' LIMIT 1",
          [user.id],
        );
        if (!approved.rowCount) throw new AuthError("An approved vehicle is required before going online", 403);
        if (latitude == null || longitude == null) throw new AuthError("Location is required to go online");
      }
      if (latitude != null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
        throw new AuthError("Latitude is invalid");
      }
      if (longitude != null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
        throw new AuthError("Longitude is invalid");
      }
      if ((latitude == null) !== (longitude == null)) throw new AuthError("Latitude and longitude must be provided together");
      if (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100_000)) {
        throw new AuthError("Location accuracy is invalid");
      }

      const result = await pool.query(
        `INSERT INTO driver_presence
          (driver_user_id, is_online, latitude, longitude, location_accuracy_m, last_seen_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, CASE WHEN $2 THEN now() ELSE NULL END, now())
         ON CONFLICT (driver_user_id) DO UPDATE SET
           is_online = EXCLUDED.is_online,
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           location_accuracy_m = EXCLUDED.location_accuracy_m,
           last_seen_at = CASE WHEN EXCLUDED.is_online THEN now() ELSE driver_presence.last_seen_at END,
           updated_at = now()
         RETURNING is_online, last_seen_at, updated_at`,
        [user.id, input.isOnline, input.isOnline ? latitude : null, input.isOnline ? longitude : null, input.isOnline ? accuracy : null],
      );
      return { isOnline: result.rows[0].is_online, lastSeenAt: result.rows[0].last_seen_at, updatedAt: result.rows[0].updated_at };
    },
  };
}
