import { AuthError } from "./auth-service.mjs";

const UUID = /^[0-9a-f-]{36}$/i;
export function createRatingService(pool) {
  return {
    async submitRating(user, tripId, body = {}) {
      if (!["passenger", "driver"].includes(user?.role)) throw new AuthError("Passenger or driver account required", 403);
      if (!UUID.test(tripId ?? "")) throw new AuthError("Trip ID is invalid");
      const score = Number(body.score);
      if (!Number.isInteger(score) || score < 1 || score > 5) throw new AuthError("Rating must be an integer from 1 to 5");
      const comment = typeof body.comment === "string" ? body.comment.trim() : "";
      if (comment.length > 500) throw new AuthError("Comment must be 500 characters or less");
      const trip = await pool.query(
        "SELECT id, passenger_user_id, driver_user_id, status FROM trips WHERE id=$1",
        [tripId],
      );
      const row = trip.rows[0];
      if (!row || row.status !== "completed") throw new AuthError("Ratings are available only after a completed trip", 409);
      const expectedRater = user.role === "passenger" ? row.passenger_user_id : row.driver_user_id;
      const ratedUser = user.role === "passenger" ? row.driver_user_id : row.passenger_user_id;
      if (expectedRater !== user.id || !ratedUser) throw new AuthError("You are not a participant in this trip", 403);
      try {
        const saved = await pool.query(
          "INSERT INTO trip_ratings(trip_id,rater_user_id,rated_user_id,rater_role,score,comment) " +
          "VALUES($1,$2,$3,$4,$5,$6) RETURNING id, score, comment, created_at",
          [tripId, user.id, ratedUser, user.role, score, comment || null],
        );
        return { rating: saved.rows[0], tripId, ratedUserId: ratedUser };
      } catch (error) {
        if (error.code === "23505") throw new AuthError("You have already rated this trip", 409);
        throw error;
      }
    },
    async getRatingsForUser(user, limit = 50) {
      if (!user?.id || !["passenger", "driver", "owner"].includes(user.role)) throw new AuthError("Account required", 403);
      const result = await pool.query(
        "SELECT score, comment, created_at FROM trip_ratings WHERE rated_user_id=$1 ORDER BY created_at DESC LIMIT $2",
        [user.id, Math.min(Math.max(Number(limit) || 50, 1), 100)],
      );
      const average = result.rows.length ? result.rows.reduce((sum, item) => sum + Number(item.score), 0) / result.rows.length : null;
      return { average: average === null ? null : Number(average.toFixed(2)), count: result.rows.length, ratings: result.rows };
    },
  };
}
