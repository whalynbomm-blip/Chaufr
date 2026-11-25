import test from "node:test";
import assert from "node:assert/strict";
import { offerTripToNextDriver } from "./dispatch-service.mjs";

function fakePool(candidateRows) {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      const statement = String(sql);
      if (statement === "BEGIN" || statement === "COMMIT" || statement === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (statement.includes("FROM trips WHERE id = $1 FOR UPDATE")) {
        return { rows: [{ id: "trip-1", status: "requested", driver_user_id: null, vehicle_category: "standard" }], rowCount: 1 };
      }
      if (statement.includes("SELECT id, driver_user_id, expires_at FROM trip_offers")) return { rows: [], rowCount: 0 };
      if (statement.includes("SELECT p.driver_user_id")) return { rows: candidateRows, rowCount: candidateRows.length };
      if (statement.includes("INSERT INTO trip_offers")) {
        return { rows: [{ id: "offer-1", driver_user_id: params[1], expires_at: "2026-11-26T10:00:25Z" }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  return { connect: async () => client, calls };
}

test("dispatch selects the shortest traffic-aware ETA, not the closest straight-line driver", async () => {
  const pool = fakePool([
    { driver_user_id: "driver-near", latitude: -33.91, longitude: 18.41, distance_km: "1.0" },
    { driver_user_id: "driver-fast", latitude: -33.92, longitude: 18.42, distance_km: "1.8" },
  ]);
  const routesService = {
    async computeRouteMatrix(origin, destinations) {
      assert.equal(destinations.length, 2);
      return [
        { destinationIndex: 0, durationSeconds: 720, hasRoute: true },
        { destinationIndex: 1, durationSeconds: 240, hasRoute: true },
      ];
    },
  };
  const result = await offerTripToNextDriver(pool, "trip-1", { latitude: -33.9, longitude: 18.4 }, routesService);
  assert.equal(result.driverUserId, "driver-fast");
  assert.equal(result.rankingMethod, "google_routes_traffic_eta");
  assert.equal(result.estimatedPickupMinutes, 4);
  const insert = pool.calls.find((call) => call.sql.includes("INSERT INTO trip_offers"));
  assert.equal(insert.params[1], "driver-fast");
});

test("dispatch falls back to nearest eligible driver when Google Routes fails", async () => {
  const pool = fakePool([
    { driver_user_id: "driver-near", latitude: -33.91, longitude: 18.41, distance_km: "1.0" },
    { driver_user_id: "driver-far", latitude: -33.92, longitude: 18.42, distance_km: "2.0" },
  ]);
  const result = await offerTripToNextDriver(
    pool,
    "trip-1",
    { latitude: -33.9, longitude: 18.4 },
    { async computeRouteMatrix() { throw new Error("provider unavailable"); } },
  );
  assert.equal(result.driverUserId, "driver-near");
  assert.equal(result.rankingMethod, "straight_line_distance");
});
