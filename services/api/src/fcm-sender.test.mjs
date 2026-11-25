import test from "node:test";
import assert from "node:assert/strict";
import { createFcmSender } from "./fcm-sender.mjs";

test("FCM sender reports an explicit skipped state until service-account credentials are configured", async () => {
  const sender = createFcmSender({ credentialsJson: "", fetchImpl: async () => { throw new Error("must not call network"); } });
  assert.equal(sender.isConfigured(), false);
  assert.deepEqual(await sender.sendToTokens(["token"], { title: "Chaufr", body: "Test" }), {
    sent: 0, skipped: true, reason: "firebase_not_configured",
  });
});

test("FCM sender rejects malformed service-account configuration", () => {
  assert.throws(() => createFcmSender({ credentialsJson: "not-json" }), /valid service-account JSON/);
});
