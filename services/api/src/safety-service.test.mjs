import test from "node:test";
import assert from "node:assert/strict";
import { createSafetyService } from "./safety-service.mjs";

const tripId = "00000000-0000-4000-8000-000000000001";
const passengerId = "00000000-0000-4000-8000-000000000002";
const driverId = "00000000-0000-4000-8000-000000000003";

function poolMock() {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      if (String(sql).startsWith("SELECT passenger_user_id")) {
        return { rows: [{ passenger_user_id: passengerId, driver_user_id: driverId }] };
      }
      if (String(sql).startsWith("INSERT INTO user_blocks")) {
        return { rows: [{ id: "block-id", created_at: "2026-11-26T10:00:00Z" }] };
      }
      if (String(sql).startsWith("INSERT INTO safety_reports")) {
        return { rows: [{ id: "report-id", status: "open", created_at: "2026-11-26T10:00:00Z" }] };
      }
      return { rows: [] };
    },
  };
}

test("passenger can block the other participant on their trip", async () => {
  const pool = poolMock();
  const service = createSafetyService(pool);
  const result = await service.blockParticipant({ id: passengerId, role: "passenger" }, {
    tripId, blockedUserId: driverId,
  });
  assert.equal(result.blocked, true);
  assert.equal(pool.calls[1].params[1], driverId);
});

test("trip-linked safety report records allowed reason and limited notes", async () => {
  const service = createSafetyService(poolMock());
  const result = await service.reportParticipant({ id: driverId, role: "driver" }, {
    tripId, reportedUserId: passengerId, reasonCode: "harassment", notes: "Test report details",
  });
  assert.equal(result.status, "open");
  assert.equal(result.reportId, "report-id");
});

test("safety actions reject outsiders and self-targeting", async () => {
  const service = createSafetyService(poolMock());
  await assert.rejects(() => service.reportParticipant({ id: "outsider", role: "driver" }, {
    tripId, reportedUserId: passengerId, reasonCode: "other",
  }), /one of your trips/);
  await assert.rejects(() => service.blockParticipant({ id: passengerId, role: "passenger" }, {
    tripId, blockedUserId: passengerId,
  }), /cannot block yourself/);
});
