import test from "node:test";
import assert from "node:assert/strict";
import { createRatingService } from "./rating-service.mjs";

const tripId = "00000000-0000-4000-8000-000000000001";
const passenger = { id: "passenger-id", role: "passenger" };
const driver = { id: "driver-id", role: "driver" };
function poolFor(status = "completed") {
  const calls = [];
  return {
    calls,
    async query(sql, args) {
      calls.push({ sql, args });
      if (sql.includes("SELECT id, passenger_user_id")) return { rows: [{ id: tripId, passenger_user_id: passenger.id, driver_user_id: driver.id, status }] };
      if (sql.includes("INSERT INTO trip_ratings")) return { rows: [{ id: "rating-id", score: args[4], comment: args[5], created_at: "now" }] };
      if (sql.includes("SELECT score, comment")) return { rows: [{ score: 5, comment: "Great ride", created_at: "now" }] };
      return { rows: [] };
    },
  };
}

test("passenger submits rating to driver for completed trip", async () => {
  const pool = poolFor();
  const result = await createRatingService(pool).submitRating(passenger, tripId, { score: 5, comment: "Great ride" });
  assert.equal(result.ratedUserId, driver.id);
  assert.equal(result.rating.score, 5);
  assert.equal(pool.calls.at(-1).args[3], "passenger");
});

test("driver rating is directed to passenger", async () => {
  const pool = poolFor();
  const result = await createRatingService(pool).submitRating(driver, tripId, { score: 4 });
  assert.equal(result.ratedUserId, passenger.id);
  assert.equal(pool.calls.at(-1).args[3], "driver");
});

test("ratings reject trips that are not completed", async () => {
  await assert.rejects(() => createRatingService(poolFor("started")).submitRating(passenger, tripId, { score: 5 }), /completed trip/);
});

test("ratings reject non-participants and invalid scores", async () => {
  await assert.rejects(() => createRatingService(poolFor()).submitRating({ id: "other", role: "passenger" }, tripId, { score: 5 }), /participant/);
  await assert.rejects(() => createRatingService(poolFor()).submitRating(passenger, tripId, { score: 6 }), /integer from 1 to 5/);
});

test("rating comments have a 500 character limit", async () => {
  await assert.rejects(() => createRatingService(poolFor()).submitRating(passenger, tripId, { score: 4, comment: "x".repeat(501) }), /500 characters/);
});
