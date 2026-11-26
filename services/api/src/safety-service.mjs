import { AuthError } from "./auth-service.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS = new Set(["unsafe_driving", "harassment", "identity_issue", "route_concern", "payment_dispute", "other"]);

function requireMember(user) {
  if (!user || !["passenger", "driver"].includes(user.role)) throw new AuthError("Passenger or driver account required", 403);
}
async function tripParticipant(pool, tripId, userId, targetUserId = null) {
  if (!UUID.test(String(tripId ?? ""))) throw new AuthError("Trip ID is invalid");
  const result = await pool.query(
    "SELECT passenger_user_id, driver_user_id FROM trips WHERE id = $1",
    [tripId],
  );
  const trip = result.rows[0];
  if (!trip || (trip.passenger_user_id !== userId && trip.driver_user_id !== userId)) {
    throw new AuthError("Safety action must relate to one of your trips", 403);
  }
  if (targetUserId != null && targetUserId !== trip.passenger_user_id && targetUserId !== trip.driver_user_id) {
    throw new AuthError("Reported or blocked user must be the other trip participant", 403);
  }
  return trip;
}

export function createSafetyService(pool) {
  if (!pool || typeof pool.query !== "function") throw new TypeError("A PostgreSQL query pool is required");
  return {
    async blockParticipant(user, input = {}) {
      requireMember(user);
      const trip = await tripParticipant(pool, input.tripId, user.id, input.blockedUserId);
      if (input.blockedUserId === user.id) throw new AuthError("You cannot block yourself");
      if (!trip.driver_user_id) throw new AuthError("Blocking is available only after a driver has been assigned", 409);
      const result = await pool.query(
        "INSERT INTO user_blocks (blocker_user_id, blocked_user_id, trip_id) VALUES ($1, $2, $3) " +
        "ON CONFLICT (blocker_user_id, blocked_user_id) DO UPDATE SET trip_id = EXCLUDED.trip_id " +
        "RETURNING id, created_at",
        [user.id, input.blockedUserId, input.tripId],
      );
      return { blocked: true, blockId: result.rows[0].id, createdAt: result.rows[0].created_at };
    },
    async reportParticipant(user, input = {}) {
      requireMember(user);
      const trip = await tripParticipant(pool, input.tripId, user.id, input.reportedUserId);
      if (input.reportedUserId === user.id) throw new AuthError("You cannot report yourself");
      if (!trip.driver_user_id) throw new AuthError("Trip must have a driver assigned to report a participant", 409);
      if (!REASONS.has(input.reasonCode)) throw new AuthError("A valid report reason is required");
      const notes = typeof input.notes === "string" ? input.notes.trim() : "";
      if (notes.length > 500) throw new AuthError("Report notes cannot exceed 500 characters");
      const result = await pool.query(
        "INSERT INTO safety_reports (trip_id, reporter_user_id, reported_user_id, reason_code, notes) " +
        "VALUES ($1, $2, $3, $4, $5) RETURNING id, status, created_at",
        [input.tripId, user.id, input.reportedUserId, input.reasonCode, notes],
      );
      return { reportId: result.rows[0].id, status: result.rows[0].status, createdAt: result.rows[0].created_at };
    },
  };
}
