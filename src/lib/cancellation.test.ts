import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookingChargeCents,
  canCoachCancel,
  canParentCancel,
  freeCancelDeadline,
  freeCancelNightLabel,
  freeCancelPolicyText,
  parentCancelOutcome,
} from "./cancellation";

const at = (iso: string) => new Date(iso);
// Sat 2026-10-24, 4:30 PM PDT (UTC-7).
const SAT_430PM = at("2026-10-24T23:30:00Z");

test("the deadline is midnight Pacific at the start of the session's day", () => {
  // Midnight PDT on Oct 24 is 07:00 UTC.
  assert.equal(freeCancelDeadline(SAT_430PM).toISOString(), "2026-10-24T07:00:00.000Z");
  assert.equal(freeCancelNightLabel(SAT_430PM), "Fri, Oct 23");
  assert.equal(freeCancelPolicyText(SAT_430PM), "Free cancellation until 11:59 PM PT on Fri, Oct 23");
});

test("cancelling up to 11:59 PM PT the night before is free; from midnight it's late", () => {
  assert.equal(parentCancelOutcome(SAT_430PM, at("2026-10-20T12:00:00Z")), "FREE");
  assert.equal(parentCancelOutcome(SAT_430PM, at("2026-10-24T06:59:59Z")), "FREE"); // Fri 11:59:59 PM PDT
  assert.equal(parentCancelOutcome(SAT_430PM, at("2026-10-24T07:00:00Z")), "LATE"); // Sat 12:00 AM PDT
  assert.equal(parentCancelOutcome(SAT_430PM, at("2026-10-24T23:00:00Z")), "LATE");
});

test("an evening session in UTC terms is still judged by its Pacific day", () => {
  // Fri 2026-10-23, 7:00 PM PDT = Sat 02:00 UTC. The deadline is Fri midnight PDT, not Sat.
  const friEvening = at("2026-10-24T02:00:00Z");
  assert.equal(freeCancelDeadline(friEvening).toISOString(), "2026-10-23T07:00:00.000Z");
  assert.equal(freeCancelNightLabel(friEvening), "Thu, Oct 22");
});

test("standard time and the clock-change days", () => {
  // Sat 2026-12-05, 9:00 AM PST: deadline is midnight PST (08:00 UTC).
  assert.equal(freeCancelDeadline(at("2026-12-05T17:00:00Z")).toISOString(), "2026-12-05T08:00:00.000Z");
  // Sun 2026-11-01 (fall back at 2 AM): midnight is still PDT (07:00 UTC).
  assert.equal(freeCancelDeadline(at("2026-11-01T18:00:00Z")).toISOString(), "2026-11-01T07:00:00.000Z");
  // Sun 2027-03-14 (spring forward at 2 AM): midnight is still PST (08:00 UTC).
  assert.equal(freeCancelDeadline(at("2027-03-14T18:00:00Z")).toISOString(), "2027-03-14T08:00:00.000Z");
});

test("parents can cancel until the start; coaches until the end", () => {
  const b = { scheduledAt: SAT_430PM, durationMinutes: 60 };
  assert.equal(canParentCancel(b, at("2026-10-24T23:29:59Z")), true);
  assert.equal(canParentCancel(b, at("2026-10-24T23:30:00Z")), false);
  assert.equal(canCoachCancel(b, at("2026-10-25T00:29:59Z")), true);
  assert.equal(canCoachCancel(b, at("2026-10-25T00:30:00Z")), false);
});

test("the charge is the price less credit or bundle discount", () => {
  assert.equal(bookingChargeCents({ priceCents: 5000, discountCents: 0 }), 5000);
  assert.equal(bookingChargeCents({ priceCents: 5000, discountCents: 500 }), 4500);
});
