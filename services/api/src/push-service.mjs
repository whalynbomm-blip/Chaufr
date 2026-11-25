import { AuthError } from "./auth-service.mjs";

export function createPushService(pool, fcmSender = null) {
  if (!pool || typeof pool.query !== "function") throw new TypeError("A PostgreSQL pool is required");
  return {
    async registerDevice(user, input = {}) {
      if (!user?.id || !["driver", "passenger"].includes(user.role)) throw new AuthError("A passenger or driver account is required", 403);
      const token = typeof input.fcmToken === "string" ? input.fcmToken.trim() : "";
      const platform = input.platform ?? "android";
      const deviceLabel = typeof input.deviceLabel === "string" ? input.deviceLabel.trim().slice(0, 80) : "";
      if (token.length < 20 || token.length > 4096) throw new AuthError("A valid Firebase device token is required");
      if (platform !== "android") throw new AuthError("Unsupported push device platform");
      const result = await pool.query(
        `INSERT INTO push_devices (user_id, fcm_token, platform, device_label, is_active, last_seen_at, updated_at)
         VALUES ($1, $2, $3, $4, true, now(), now())
         ON CONFLICT (fcm_token) DO UPDATE
           SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform,
               device_label = EXCLUDED.device_label, is_active = true,
               last_seen_at = now(), updated_at = now()
         RETURNING id`,
        [user.id, token, platform, deviceLabel],
      );
      return { registered: true, deviceId: result.rows[0].id };
    },

    async sendToUser(userId, message) {
      if (!fcmSender) return { sent: 0, skipped: true, reason: "firebase_not_configured" };
      const result = await pool.query(
        "SELECT fcm_token FROM push_devices WHERE user_id = $1 AND is_active = true ORDER BY last_seen_at DESC LIMIT 20",
        [userId],
      );
      if (!result.rowCount) return { sent: 0, skipped: true, reason: "no_registered_devices" };
      const delivery = await fcmSender.sendToTokens(result.rows.map((row) => row.fcm_token), message);
      if (delivery.invalidTokens?.length) {
        await pool.query("UPDATE push_devices SET is_active = false, updated_at = now() WHERE fcm_token = ANY($1::text[])", [delivery.invalidTokens]);
      }
      return delivery;
    },

    async unregisterDevice(user, input = {}) {
      if (!user?.id) throw new AuthError("Authentication required", 401);
      const token = typeof input.fcmToken === "string" ? input.fcmToken.trim() : "";
      if (!token || token.length > 4096) throw new AuthError("A valid Firebase device token is required");
      const result = await pool.query(
        "UPDATE push_devices SET is_active = false, updated_at = now() WHERE user_id = $1 AND fcm_token = $2",
        [user.id, token],
      );
      return { unregistered: true, changed: result.rowCount > 0 };
    },
  };
}
