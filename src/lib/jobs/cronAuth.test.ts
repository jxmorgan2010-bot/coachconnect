import { test } from "node:test";
import assert from "node:assert/strict";
import { isCronRequestAuthorized } from "./cronAuth";

const secret = "a".repeat(20) + "0123456789abcdef"; // 36 characters

test("accepts only the exact bearer token", () => {
  assert.equal(isCronRequestAuthorized(`Bearer ${secret}`, secret), true);
  assert.equal(isCronRequestAuthorized(`Bearer ${secret}x`, secret), false);
  assert.equal(isCronRequestAuthorized(secret, secret), false);
  assert.equal(isCronRequestAuthorized(`bearer ${secret}`, secret), false);
  assert.equal(isCronRequestAuthorized(null, secret), false);
  assert.equal(isCronRequestAuthorized("", secret), false);
});

test("refuses everything when CRON_SECRET is unset or too short", () => {
  assert.equal(isCronRequestAuthorized("Bearer ", ""), false);
  assert.equal(isCronRequestAuthorized("Bearer undefined", undefined), false);
  assert.equal(isCronRequestAuthorized("Bearer short", "short"), false);
});
