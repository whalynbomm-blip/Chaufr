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
  const pool = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [], rowCount: 0 }; } };
  const service = createPaystackService(pool, { secretKey: "test_secret" });
  const raw = Buffer.from(JSON.stringify({ event: "ping", data: { id: 123, reference: "chf_test" } }));
  const signature = createHmac("sha512", "test_secret").update(raw).digest("hex");
  const result = await service.handleWebhook(raw, signature);
  assert.equal(result.received, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /payment_provider_events/);
});

test("duplicate successful Paystack charge event is claimed once before ledger processing", async () => {
  const intentId = "11111111-1111-4111-8111-111111111111";
  const raw = Buffer.from(JSON.stringify({
    event: "charge.success",
    data: { id: 987654, reference: "chf_duplicate_test" },
  }));
  const signature = createHmac("sha512", "test_secret").update(raw).digest("hex");
  const clientCalls = [];
  const client = {
    query: async (sql, params) => {
      clientCalls.push({ sql, params });
      if (sql.includes("INSERT INTO payment_provider_events")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    },
    release: () => {},
  };
  const pool = {
    query: async (sql) => {
      assert.match(sql, /FROM payment_intents WHERE id=\$1/);
      return { rows: [{
        id: intentId, amount_minor: 3000, user_id: "22222222-2222-4222-8222-222222222222",
        purpose: "driver_activation", trip_id: null, activation_id: "33333333-3333-4333-8333-333333333333",
        status: "paid", provider_reference: "chf_duplicate_test",
      }], rowCount: 1 };
    },
    connect: async () => client,
  };
  const service = createPaystackService(pool, {
    secretKey: "test_secret",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        status: true,
        data: {
          status: "success", currency: "ZAR", amount: 3000,
          reference: "chf_duplicate_test", metadata: { chaufrIntentId: intentId },
        },
      }),
    }),
  });
  const result = await service.handleWebhook(raw, signature);
  assert.equal(result.duplicate, true);
  assert.equal(clientCalls.filter((call) => call.sql.includes("INSERT INTO payment_provider_events")).length, 1);
  assert.equal(clientCalls.some((call) => call.sql.includes("UPDATE payment_intents SET status='paid'")), false);
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
  const pool = { query: async () => ({ rows: [], rowCount: 0 }) };
  const service = createPaystackService(pool, { secretKey: "api_secret", webhookSecret: "whsec_test" });
  const raw = Buffer.from(JSON.stringify({ event: "ping", data: { id: 456, reference: "chf_new" } }));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const digest = createHmac("sha512", "whsec_test").update(timestamp + ".").update(raw).digest("hex");
  const result = await service.handleWebhook(raw, `t=${timestamp},v1=whk_test:${digest}`);
  assert.equal(result.received, true);
});

test("ambiguous Paystack transfer errors keep driver payout processing to prevent duplicate retries", async () => {
  const calls = [];
  const pool = {
    async query(sql, params = []) {
      const query = String(sql);
      calls.push({ query, params });
      if (query.includes("FROM trips t JOIN driver_payout_accounts")) {
        return { rowCount: 1, rows: [{
          id: "44444444-4444-4444-8444-444444444444",
          driver_user_id: "55555555-5555-4555-8555-555555555555",
          driver_earnings: "88.00", reward_redemption: "false",
          paystack_recipient_code: "RCP_test",
        }] };
      }
      return { rowCount: 1, rows: [] };
    },
  };
  const service = createPaystackService(pool, {
    secretKey: "test_secret",
    fetchImpl: async () => { throw new Error("network timeout after request"); },
  });
  await assert.rejects(
    service.payDriverEarnings({ id: "66666666-6666-4666-8666-666666666666", role: "owner" },
      "44444444-4444-4444-8444-444444444444"),
    /network timeout/,
  );
  const payoutUpdate = calls.find((call) => call.query.includes("UPDATE driver_payouts SET status='processing'"));
  assert.ok(payoutUpdate, "ambiguous transfer must remain processing");
  assert.equal(calls.some((call) => call.query.includes("SET status=$2") && call.params[1] === "failed"), false);
});
