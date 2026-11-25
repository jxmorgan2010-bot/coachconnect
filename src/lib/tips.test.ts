import { test } from "node:test";
import assert from "node:assert/strict";
import { canTip, tipWasCharged } from "./tips";
import { chargeTipOffSession } from "./payment";

const done = { status: "COMPLETED", tippedAt: null, stripePaymentMethodId: "pm_1" };

test("with tips off, no session can be tipped", () => {
  assert.equal(canTip(done, false), false);
});

test("with tips on, only a completed, untipped session with its own card can be tipped", () => {
  assert.equal(canTip(done, true), true);
  assert.equal(canTip({ ...done, stripePaymentMethodId: null }, true), false, "package or credit-covered session");
  assert.equal(canTip({ ...done, status: "CONFIRMED" }, true), false);
  assert.equal(canTip({ ...done, tippedAt: new Date() }, true), false);
});

test("a recorded tip counts as charged only when there was a card to charge", () => {
  assert.equal(tipWasCharged({ tippedAt: new Date(), stripePaymentMethodId: "pm_1" }), true);
  assert.equal(tipWasCharged({ tippedAt: new Date(), stripePaymentMethodId: null }), false);
  assert.equal(tipWasCharged({ tippedAt: null, stripePaymentMethodId: "pm_1" }), false);
});

test("charging a tip with no card is an error, so it can't be recorded as sent", async () => {
  await assert.rejects(chargeTipOffSession("cus_1", null, 500), /no saved card/);
  await assert.rejects(chargeTipOffSession(null, "pm_1", 500), /no saved card/);
});
