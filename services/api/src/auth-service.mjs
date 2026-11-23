import {
  createAccessToken, hashAccessToken, hashPassword, verifyPassword,
} from "./auth-crypto.mjs";

const SESSION_DAYS = 30;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+[1-9]\d{7,14}$/;

export class AuthError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

const publicUser = (row) => ({
  id: row.id,
  displayName: row.display_name,
  email: row.email,
  phone: row.phone_e164,
  role: row.role,
  status: row.status,
  createdAt: row.created_at,
});

const createSession = async (client, userId) => {
  const accessToken = createAccessToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await client.query(
    "INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, hashAccessToken(accessToken), expiresAt],
  );
  return { accessToken, tokenType: "Bearer", expiresAt: expiresAt.toISOString() };
};

const normalizeIdentifier = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.includes("@") ? trimmed.toLowerCase() : trimmed;
};

export function createAuthService(pool) {
  if (!pool || typeof pool.connect !== "function") {
    throw new TypeError("A PostgreSQL pool is required");
  }

  return {
    async register(input = {}) {
      const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
      const email = typeof input.email === "string" && input.email.trim()
        ? input.email.trim().toLowerCase() : null;
      const phone = typeof input.phone === "string" && input.phone.trim()
        ? input.phone.trim() : null;
      const role = input.role ?? "passenger";

      if (displayName.length < 2 || displayName.length > 80) {
        throw new AuthError("Display name must be between 2 and 80 characters");
      }
      if (!email && !phone) throw new AuthError("Provide an email address or phone number");
      if (email && (email.length > 254 || !emailPattern.test(email))) {
        throw new AuthError("Enter a valid email address");
      }
      if (phone && !phonePattern.test(phone)) {
        throw new AuthError("Phone number must use international format, for example +27821234567");
      }
      if (!["passenger", "driver"].includes(role)) {
        throw new AuthError("Only passenger and driver accounts can register publicly", 403);
      }

      const passwordHash = await hashPassword(input.password);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query(
          `INSERT INTO users (email, phone_e164, password_hash, role, display_name)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, email, phone_e164, role, status, display_name, created_at`,
          [email, phone, passwordHash, role, displayName],
        );
        const user = inserted.rows[0];
        if (role === "driver") {
          await client.query("INSERT INTO driver_profiles (user_id) VALUES ($1)", [user.id]);
        }
        const session = await createSession(client, user.id);
        await client.query("COMMIT");
        return { user: publicUser(user), ...session };
      } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23505") {
          throw new AuthError("An account with these details already exists", 409);
        }
        throw error;
      } finally {
        client.release();
      }
    },

    async login(input = {}) {
      const identifier = normalizeIdentifier(input.identifier);
      if (!identifier || typeof input.password !== "string") {
        throw new AuthError("Enter your email or phone number and password", 400);
      }
      const result = await pool.query(
        `SELECT id, email, phone_e164, password_hash, role, status, display_name, created_at
         FROM users WHERE email = $1 OR phone_e164 = $1 LIMIT 1`,
        [identifier],
      );
      const user = result.rows[0];
      const hashToVerify = user ? user.password_hash : await dummyPasswordHashPromise;
      const passwordValid = await verifyPassword(input.password, hashToVerify);
      if (!user || !passwordValid || ["suspended", "closed"].includes(user.status)) {
        throw new AuthError("Invalid login details or account unavailable", 401);
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const session = await createSession(client, user.id);
        await client.query("COMMIT");
        return { user: publicUser(user), ...session };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async authenticate(accessToken) {
      let tokenHash;
      try { tokenHash = hashAccessToken(accessToken); }
      catch { return null; }
      const result = await pool.query(
        `SELECT s.id AS session_id, u.id, u.email, u.phone_e164, u.role, u.status,
                u.display_name, u.created_at
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.revoked_at IS NULL
           AND s.expires_at > now() AND u.status NOT IN ('suspended', 'closed')
         LIMIT 1`,
        [tokenHash],
      );
      const row = result.rows[0];
      if (!row) return null;
      await pool.query("UPDATE auth_sessions SET last_used_at = now() WHERE id = $1", [row.session_id]);
      return publicUser(row);
    },

    async logout(accessToken) {
      let tokenHash;
      try { tokenHash = hashAccessToken(accessToken); }
      catch { return false; }
      const result = await pool.query(
        "UPDATE auth_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
        [tokenHash],
      );
      return result.rowCount > 0;
    },
  };
}
