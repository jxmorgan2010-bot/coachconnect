import { test } from "node:test";
import assert from "node:assert/strict";
import { holdDueAt, holdFixDeadline, holdsAtBooking, holdState } from "./holdTiming";

const session = new Date("2026-11-14T21:00:00.000Z"); // Sat Nov 14, 1:00 PM PT
const HOUR = 60 * 60 * 1000;

test("the hold is due exactly 2 days before the session", () => {
  assert.equal(holdDueAt(session).toISOString(), "2026-11-12T21:00:00.000Z");
});

test("booked more than 2 days ahead: card saved, no hold; 2 days or less: hold now", () => {
  assert.equal(holdsAtBooking(session, new Date(session.getTime() - 49 * HOUR)), false);
  assert.equal(holdsAtBooking(session, new Date(session.getTime() - 48 * HOUR)), true);
  assert.equal(holdsAtBooking(session, new Date(session.getTime() - 3 * HOUR)), true);
});

test("a failed hold has until 12 hours before the session", () => {
  assert.equal(holdFixDeadline(session).toISOString(), "2026-11-14T09:00:00.000Z");
});

test("hold state for the dashboards", () => {
  const base = { packageId: null, stripePaymentIntentId: null, holdDueAt: null, holdFailedAt: null };
  assert.equal(holdState({ ...base, stripePaymentIntentId: "pi_1" }), "HELD");
  assert.equal(holdState({ ...base, holdDueAt: holdDueAt(session) }), "SAVED");
  assert.equal(holdState({ ...base, holdDueAt: holdDueAt(session), holdFailedAt: new Date() }), "FAILED");
  // A hold placed with a new card after a failure is HELD (the failure is cleared then anyway).
  assert.equal(holdState({ ...base, stripePaymentIntentId: "pi_2", holdFailedAt: new Date() }), "HELD");
  assert.equal(holdState({ ...base, packageId: "pkg" }), "NONE");
  assert.equal(holdState(base), "NONE");
});
