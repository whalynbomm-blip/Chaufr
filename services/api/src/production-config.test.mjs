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
  FARE_CURRENCY: "ZAR",
};
const firebase = JSON.stringify({
  project_id: "chaufr-test",
  client_email: "firebase-admin@chaufr-test.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----",
});

test("production configuration accepts the secure core without optional messaging vendors", () => {
  const result = validateProductionEnvironment(valid);
  assert.equal(result.production, true);
  assert.deepEqual(result.optional, { firebasePush: false, twilioSms: false });
});

test("production configuration accepts configured Firebase and Twilio integrations", () => {
  const result = validateProductionEnvironment({
    ...valid,
    FIREBASE_SERVICE_ACCOUNT_JSON: firebase,
    TWILIO_ACCOUNT_SID: "AC" + "1".repeat(32),
    TWILIO_AUTH_TOKEN: "twilio-test-token",
    TWILIO_FROM_NUMBER: "+27110000000",
    SMS_VERIFICATION_SECRET: "a-random-secret-with-at-least-32-bytes",
  });
  assert.deepEqual(result.optional, { firebasePush: true, twilioSms: true });
});

test("development and test environments do not require production secrets", () => {
  assert.equal(validateProductionEnvironment({ NODE_ENV: "test" }).production, false);
});

test("production startup fails closed when a core secret is missing", () => {
  const env = { ...valid };
  delete env.DOCUMENT_ENCRYPTION_KEY;
  assert.throws(() => validateProductionEnvironment(env), /DOCUMENT_ENCRYPTION_KEY/);
});

test("production startup rejects malformed document encryption keys", () => {
  assert.throws(() => validateProductionEnvironment({ ...valid, DOCUMENT_ENCRYPTION_KEY: "short" }), /DOCUMENT_ENCRYPTION_KEY/);
});

test("production startup rejects malformed Firebase service-account configuration when supplied", () => {
  assert.throws(() => validateProductionEnvironment({ ...valid, FIREBASE_SERVICE_ACCOUNT_JSON: "{}" }), /FIREBASE_SERVICE_ACCOUNT_JSON/);
});

test("partial Twilio configuration is rejected instead of silently disabling SMS", () => {
  assert.throws(() => validateProductionEnvironment({ ...valid, TWILIO_ACCOUNT_SID: "AC" + "1".repeat(32) }), /Twilio SMS configuration is incomplete/);
});

test("production startup rejects a non-E.164 Twilio sender number", () => {
  assert.throws(() => validateProductionEnvironment({
    ...valid,
    TWILIO_ACCOUNT_SID: "AC" + "1".repeat(32),
    TWILIO_AUTH_TOKEN: "twilio-test-token",
    TWILIO_FROM_NUMBER: "0211234567",
    SMS_VERIFICATION_SECRET: "a-random-secret-with-at-least-32-bytes",
  }), /E.164/);
});
