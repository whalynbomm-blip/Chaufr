import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createPaystackService, createDriverVerificationService } from "./financial-identity-service.mjs";

test("Paystack webhook rejects an invalid signature before touching the database", async () => {
  let queried = false;
  const service = createPaystackService({ query: async () => { queried = true; } }, {
    secretKey: "test_secret",
    fetchImpl: async () => { throw new Error("Provider must not be called"); },
  });
  await assert.rejects(
    () => service.handleWebhook(Buffer.from(JSON.stringify({ event: "unknown", data: { id: "1" } })), "bad"),
    (error) => error.status === 401,
  );
  assert.equal(queried, false);
});

test("Paystack webhook accepts an authentic event and stores it idempotently", async () => {
  const calls = [];
  const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [], rowCount: 1 }; } };
  const service = createPaystackService(pool, { secretKey: "test_secret" });
  const raw = Buffer.from(JSON.stringify({ event: "charge.failed", data: { id: 123, reference: "chf_test" } }));
  const signature = createHmac("sha512", "test_secret").update(raw).digest("hex");
  const result = await service.handleWebhook(raw, signature);
  assert.equal(result.received, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /payment_provider_events/);
});

test("driver verification documents cannot be uploaded by a passenger", async () => {
  const service = createDriverVerificationService({ query: async () => { throw new Error("Database must not be touched"); } }, {
    encryptionKey: Buffer.alloc(32, 1).toString("base64"),
  });
  await assert.rejects(
    () => service.upload({ id: "p1", role: "passenger" }, {}),
    (error) => error.status === 403,
  );
});

test("Paystack timestamped webhook signature uses the dedicated webhook secret", async () => {
  const pool = { query: async () => ({ rows: [], rowCount: 1 }) };
  const service = createPaystackService(pool, { secretKey: "api_secret", webhookSecret: "whsec_test" });
  const raw = Buffer.from(JSON.stringify({ event: "charge.failed", data: { id: 456, reference: "chf_new" } }));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const digest = createHmac("sha512", "whsec_test").update(timestamp + ".").update(raw).digest("hex");
  const result = await service.handleWebhook(raw, `t=${timestamp},v1=whk_test:${digest}`);
  assert.equal(result.received, true);
});
