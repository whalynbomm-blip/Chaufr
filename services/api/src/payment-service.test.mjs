import test from "node:test";
import assert from "node:assert/strict";
import { createPaymentService } from "./payment-service.mjs";

test("payment intents require valid purpose and exact ZAR cents", async () => {
  const calls = [];
  const pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [{ id: "intent-1", purpose: params[1], amount_minor: params[4], currency: "ZAR", status: "pending", expires_at: "2026-11-26T12:00:00Z" }] };
  }};
  const service = createPaymentService(pool);
  await assert.rejects(() => service.createIntent({ userId: "u1", purpose: "other", amount: 30 }));
  await assert.rejects(() => service.createIntent({ userId: "u1", purpose: "driver_activation", amount: 30.001, activationId: "a1" }));
  const intent = await service.createIntent({ userId: "u1", purpose: "driver_activation", amount: 30, activationId: "a1" });
  assert.equal(intent.amount, 30);
  assert.equal(calls[0].params[4], 3000);
});

test("verified payment rejects mismatched amounts before changing records", async () => {
  const calls = [];
  const client = { query: async (sql, params) => {
    calls.push(sql);
    if (sql.includes("SELECT id, user_id, purpose")) return { rows: [{ id: "i1", user_id: "p1", purpose: "passenger_trip", trip_id: "t1", activation_id: null, amount_minor: "5000", currency: "ZAR", status: "pending" }] };
    return { rows: [] };
  }, release() {} };
  const service = createPaymentService({ connect: async () => client });
  await assert.rejects(() => service.recordVerifiedInboundPayment({
    intentId: "i1", provider: "gateway", providerReference: "ref1", eventId: "evt1", amount: 49.99,
  }), (error) => error.status === 409);
  assert.equal(calls.includes("COMMIT"), false);
  assert.equal(calls.at(-1), "ROLLBACK");
});

test("verified payment event is idempotent", async () => {
  const client = { query: async (sql) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
    if (sql.includes("SELECT id, user_id, purpose")) return { rows: [{ id: "i1", user_id: "p1", purpose: "passenger_trip", trip_id: "t1", activation_id: null, amount_minor: "5000", currency: "ZAR", status: "pending" }] };
    if (sql.includes("INSERT INTO payment_provider_events")) return { rowCount: 0, rows: [] };
    return { rows: [] };
  }, release() {} };
  const service = createPaymentService({ connect: async () => client });
  const result = await service.recordVerifiedInboundPayment({
    intentId: "i1", provider: "gateway", providerReference: "ref1", eventId: "evt-existing", amount: 50,
  });
  assert.equal(result.duplicate, true);
  assert.equal(result.status, "pending");
});
