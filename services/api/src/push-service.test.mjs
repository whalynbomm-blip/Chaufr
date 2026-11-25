import test from "node:test";
import assert from "node:assert/strict";
import { createPushService } from "./push-service.mjs";

test("push registration stores a device token for the authenticated account", async () => {
  const calls = [];
  const service = createPushService({
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [{ id: "device-1" }], rowCount: 1 };
    },
  });
  const result = await service.registerDevice(
    { id: "user-1", role: "passenger" },
    { fcmToken: "fcm-device-token-abcdefghijklmnopqrstuvwxyz", platform: "android", deviceLabel: "Pixel" },
  );
  assert.deepEqual(result, { registered: true, deviceId: "device-1" });
  assert.match(calls[0].sql, /ON CONFLICT \(fcm_token\) DO UPDATE/);
  assert.equal(calls[0].params[0], "user-1");
});

test("push registration rejects invalid roles and malformed tokens", async () => {
  const service = createPushService({ async query() { throw new Error("should not query"); } });
  await assert.rejects(
    service.registerDevice({ id: "owner-1", role: "owner" }, { fcmToken: "fcm-device-token-abcdefghijklmnopqrstuvwxyz" }),
    /passenger or driver/,
  );
  await assert.rejects(
    service.registerDevice({ id: "user-1", role: "driver" }, { fcmToken: "short" }),
    /valid Firebase device token/,
  );
});

test("unregister only disables the caller's own device token", async () => {
  let params;
  const service = createPushService({
    async query(_sql, values) { params = values; return { rows: [], rowCount: 1 }; },
  });
  const result = await service.unregisterDevice(
    { id: "driver-1", role: "driver" },
    { fcmToken: "fcm-device-token-abcdefghijklmnopqrstuvwxyz" },
  );
  assert.equal(result.changed, true);
  assert.equal(params[0], "driver-1");
});
