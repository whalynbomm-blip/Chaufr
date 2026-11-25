import { createSign } from "node:crypto";

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

export function createFcmSender({ credentialsJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON, fetchImpl = fetch, now = () => Date.now() } = {}) {
  let credentials = null;
  let cachedAccessToken = null;
  let cachedExpiry = 0;
  try {
    if (credentialsJson) credentials = JSON.parse(credentialsJson);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON");
  }

  async function accessToken() {
    if (!credentials?.client_email || !credentials?.private_key || !credentials?.project_id) return null;
    if (cachedAccessToken && cachedExpiry > now() + 60_000) return cachedAccessToken;
    const issuedAt = Math.floor(now() / 1000);
    const header = encode({ alg: "RS256", typ: "JWT" });
    const claims = encode({
      iss: credentials.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: credentials.token_uri || "https://oauth2.googleapis.com/token",
      iat: issuedAt,
      exp: issuedAt + 3600,
    });
    const unsigned = header + "." + claims;
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    signer.end();
    const assertion = unsigned + "." + signer.sign(credentials.private_key, "base64url");
    const response = await fetchImpl(credentials.token_uri || "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!response.ok) throw new Error("Firebase OAuth token request failed");
    const result = await response.json();
    cachedAccessToken = result.access_token;
    cachedExpiry = now() + Number(result.expires_in || 3600) * 1000;
    return cachedAccessToken;
  }

  return {
    isConfigured() {
      return Boolean(credentials?.client_email && credentials?.private_key && credentials?.project_id);
    },
    async sendToTokens(tokens, message) {
      if (!this.isConfigured()) return { sent: 0, skipped: true, reason: "firebase_not_configured" };
      const bearer = await accessToken();
      let sent = 0;
      const invalidTokens = [];
      for (const token of [...new Set(tokens)].slice(0, 500)) {
        const response = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${credentials.project_id}/messages:send`, {
          method: "POST",
          headers: { authorization: "Bearer " + bearer, "content-type": "application/json" },
          body: JSON.stringify({
            message: {
              token,
              notification: {
                title: String(message.title || "Chaufr").slice(0, 100),
                body: String(message.body || "").slice(0, 300),
              },
              data: Object.fromEntries(Object.entries(message.data || {}).map(([key, value]) => [String(key), String(value)])),
              android: { priority: "HIGH" },
            },
          }),
        });
        if (response.ok) sent += 1;
        else {
          const error = await response.json().catch(() => ({}));
          if (["UNREGISTERED"].includes(error.error?.details?.find((item) => item.errorCode)?.errorCode)) {
            invalidTokens.push(token);
          }
        }
      }
      return { sent, invalidTokens };
    },
  };
}
