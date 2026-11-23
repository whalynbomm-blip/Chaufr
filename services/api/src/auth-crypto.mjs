import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Hash a user password with Node's built-in scrypt implementation.
 * The returned encoded hash is safe to store in users.password_hash.
 */
export async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(password, salt, KEY_LENGTH, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024,
  });
  return `$chaufr-scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${Buffer.from(derived).toString("base64url")}`;
}

/** Verify a password without leaking whether the account exists. */
export async function verifyPassword(password, encodedHash) {
  if (typeof password !== "string" || typeof encodedHash !== "string") return false;
  const parts = encodedHash.split("$");
  if (parts.length !== 7 || parts[1] !== "chaufr-scrypt") return false;
  const [, , n, r, p, saltText, keyText] = parts;
  if (n !== String(SCRYPT_N) || r !== String(SCRYPT_R) || p !== String(SCRYPT_P)) return false;
  let salt;
  let expected;
  try {
    salt = Buffer.from(saltText, "base64url");
    expected = Buffer.from(keyText, "base64url");
  } catch {
    return false;
  }
  if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH) return false;
  try {
    const actual = Buffer.from(await scrypt(password, salt, KEY_LENGTH, {
      N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024,
    }));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Generate a high-entropy opaque bearer token; store only its SHA-256 hash. */
export function createAccessToken() {
  return `chf_${randomBytes(32).toString("base64url")}`;
}

export function hashAccessToken(token) {
  if (typeof token !== "string" || !/^chf_[A-Za-z0-9_-]{40,60}$/.test(token)) {
    throw new TypeError("Invalid access token");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function validatePassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 128) {
    throw new TypeError("Password must be between 12 and 128 characters");
  }
}
