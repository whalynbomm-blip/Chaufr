import test from "node:test";
import assert from "node:assert/strict";
import { createWindowRateLimiter } from "./rate-limit.mjs";

test("allows up to the configured limit and resets after its window", () => {
  let time = 1000;
  const limiter = createWindowRateLimiter({ limit: 2, windowMs: 100, now: () => time });
  assert.equal(limiter.consume("client").allowed, true);
  assert.equal(limiter.consume("client").allowed, true);
  assert.equal(limiter.consume("client").allowed, false);
  time += 100;
  assert.equal(limiter.consume("client").allowed, true);
});

test("limits memory and refuses new keys when all entries remain active", () => {
  let time = 0;
  const limiter = createWindowRateLimiter({ limit: 1, windowMs: 100, maxEntries: 2, now: () => time });
  assert.equal(limiter.consume("a").allowed, true);
  assert.equal(limiter.consume("b").allowed, true);
  assert.equal(limiter.consume("c").allowed, false);
  assert.equal(limiter.size, 2);
  time = 100;
  assert.equal(limiter.consume("c").allowed, true);
  assert.equal(limiter.size, 1);
});

test("invalid keys and settings are rejected", () => {
  assert.throws(() => createWindowRateLimiter({ limit: 0, windowMs: 10 }));
  const limiter = createWindowRateLimiter({ limit: 1, windowMs: 10 });
  assert.throws(() => limiter.consume(""));
});
