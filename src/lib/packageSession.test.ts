import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionReturnedToPackage } from "./packageSession";

test("a package session put back (cancel, no-show, coach removed) was returned, not refunded", () => {
  assert.equal(sessionReturnedToPackage({ packageId: "pkg", paymentStatus: "REFUNDED", refunds: [] }), true);
});

test("a waived late cancel on a package session has a refund record of 0: still returned", () => {
  assert.equal(sessionReturnedToPackage({ packageId: "pkg", paymentStatus: "REFUNDED", refunds: [{ amountCents: 0 }] }), true);
});

test("money an admin sent back for a package session is a refund", () => {
  assert.equal(sessionReturnedToPackage({ packageId: "pkg", paymentStatus: "REFUNDED", refunds: [{ amountCents: 4050 }] }), false);
  assert.equal(sessionReturnedToPackage({ packageId: "pkg", paymentStatus: "REFUNDED", refunds: [{ amountCents: 2000 }, { amountCents: 2050 }] }), false);
});

test("a package session that's used, kept after a late cancel, or partly refunded wasn't returned", () => {
  assert.equal(sessionReturnedToPackage({ packageId: "pkg", paymentStatus: "CAPTURED", refunds: [] }), false);
  assert.equal(sessionReturnedToPackage({ packageId: "pkg", paymentStatus: "PARTIALLY_REFUNDED", refunds: [{ amountCents: 1000 }] }), false);
});

test("a single session is never 'returned to a package'", () => {
  assert.equal(sessionReturnedToPackage({ packageId: null, paymentStatus: "REFUNDED", refunds: [{ amountCents: 4500 }] }), false);
  assert.equal(sessionReturnedToPackage({ packageId: null, paymentStatus: "CANCELLED", refunds: [] }), false);
});
