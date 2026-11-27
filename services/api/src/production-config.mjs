const required = [
  "DATABASE_URL",
  "VEHICLE_DATA_ENCRYPTION_KEY",
  "DOCUMENT_ENCRYPTION_KEY",
  "FARE_QUOTE_SIGNING_SECRET",
  "GOOGLE_MAPS_SERVER_API_KEY",
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_NUMBER",
  "SMS_VERIFICATION_SECRET",
];

function decodeKey(name, value) {
  let decoded;
  try { decoded = Buffer.from(value, "base64"); } catch { decoded = Buffer.alloc(0); }
  if (decoded.length !== 32 || decoded.toString("base64").replace(/=+$/, "") !== value.replace(/=+$/, "")) {
    throw new Error(name + " must be a base64-encoded 32-byte key");
  }
}

export function validateProductionEnvironment(env = process.env) {
  if (env.NODE_ENV !== "production") return { production: false, checked: [] };
  const missing = required.filter((name) => !String(env[name] ?? "").trim());
  if (missing.length) throw new Error("Production configuration missing: " + missing.join(", "));
  if (!/^postgres(?:ql)?:\/\//i.test(env.DATABASE_URL)) throw new Error("DATABASE_URL must be a PostgreSQL connection URL");
  decodeKey("VEHICLE_DATA_ENCRYPTION_KEY", env.VEHICLE_DATA_ENCRYPTION_KEY);
  decodeKey("DOCUMENT_ENCRYPTION_KEY", env.DOCUMENT_ENCRYPTION_KEY);
  if (Buffer.byteLength(env.SMS_VERIFICATION_SECRET, "utf8") < 32) throw new Error("SMS_VERIFICATION_SECRET must contain at least 32 bytes");
  if (!/^\+[1-9]\d{7,14}$/.test(env.TWILIO_FROM_NUMBER)) throw new Error("TWILIO_FROM_NUMBER must be an E.164 phone number");
  let firebase;
  try { firebase = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON); }
  catch { throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON"); }
  if (!firebase.project_id || !firebase.client_email || !firebase.private_key || !firebase.private_key.includes("PRIVATE KEY")) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is missing valid project_id, client_email or private_key fields");
  }
  if (String(env.FARE_CURRENCY || "ZAR").toUpperCase() !== "ZAR") throw new Error("Production currency must be ZAR");
  return { production: true, checked: required };
}
