import test from "node:test";
import assert from "node:assert/strict";
import {
  createAccessToken, hashAccessToken, hashPassword, verifyPassword,
} from "./auth-crypto.mjs";

test("password hashes are salted and verify only the correct password", async () => {
  const first = await hashPassword("correct horse battery staple");
  const second = await hashPassword("correct horse battery staple");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("correct horse battery staple", first), true);
  assert.equal(await verifyPassword("incorrect password", first), false);
});

test("password policy rejects weak or oversized passwords", async () => {
  await assert.rejects(() => hashPassword("short"), /12 and 128/);
  await assert.rejects(() => hashPassword("x".repeat(129)), /12 and 128/);
});

test("opaque access tokens are random and only their hashes are persisted", () => {
  const first = createAccessToken();
  const second = createAccessToken();
  assert.match(first, /^chf_[A-Za-z0-9_-]+$/);
  assert.notEqual(first, second);
  assert.notEqual(hashAccessToken(first), first);
  assert.equal(hashAccessToken(first), hashAccessToken(first));
  assert.throws(() => hashAccessToken("not-a-token"), /Invalid access token/);
});

test("malformed password hashes fail closed", async () => {
  assert.equal(await verifyPassword("any password here", "not-a-hash"), false);
});
