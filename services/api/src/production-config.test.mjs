import test from "node:test";
import assert from "node:assert/strict";
import { validateProductionEnvironment } from "./production-config.mjs";

const key = Buffer.alloc(32, 7).toString("base64");
const valid = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:pass@db.example:5432/chaufr",
  VEHICLE_DATA_ENCRYPTION_KEY: key,
  DOCUMENT_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString("base64"),
  FARE_QUOTE_SIGNING_SECRET: "random-fare-quote-secret-with-32-bytes",
  GOOGLE_MAPS_SERVER_API_KEY: "server-restricted-google-key",
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    project_id: "chaufr-test",
    client_email: "firebase-admin@chaufr-test.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----",
  }),
  TWILIO_ACCOUNT_SID: "AC" + "1".repeat(32),
  TWILIO_AUTH_TOKEN: "twilio-test-token",
  TWILIO_FROM_NUMBER: "+27110000000",
  SMS_VERIFICATION_SECRET: "a-random-secret-with-at-least-32-bytes",
  FARE_CURRENCY: "ZAR",
};

test("production configuration accepts complete valid provider and encryption settings", () => {
  const result = validateProductionEnvironment(valid);
  assert.equal(result.production, true);
  assert.ok(result.checked.includes("FIREBASE_SERVICE_ACCOUNT_JSON"));
});

test("development and test environments do not require production secrets", () => {
  assert.equal(validateProductionEnvironment({ NODE_ENV: "test" }).production, false);
});

test("production startup fails closed when a required provider secret is missing", () => {
  const env = { ...valid };
  delete env.TWILIO_AUTH_TOKEN;
  assert.throws(() => validateProductionEnvironment(env), /TWILIO_AUTH_TOKEN/);
});

test("production startup rejects malformed document encryption keys", () => {
  assert.throws(() => validateProductionEnvironment({ ...valid, DOCUMENT_ENCRYPTION_KEY: "short" }), /DOCUMENT_ENCRYPTION_KEY/);
});

test("production startup rejects malformed Firebase service-account configuration", () => {
  assert.throws(() => validateProductionEnvironment({ ...valid, FIREBASE_SERVICE_ACCOUNT_JSON: "{}" }), /FIREBASE_SERVICE_ACCOUNT_JSON/);
});

test("production startup rejects a non-E.164 Twilio sender number", () => {
  assert.throws(() => validateProductionEnvironment({ ...valid, TWILIO_FROM_NUMBER: "0211234567" }), /E.164/);
});
