import { test } from "node:test";
import assert from "node:assert/strict";
import { nextOccurrenceOf, nextOccurrences } from "./rebook";

const at = (iso: string) => new Date(iso);
const isoList = (ds: Date[]) => ds.map((d) => d.toISOString());

test("an upcoming session rebooks one week after it, never onto itself", () => {
  // Original: Sat 2026-10-24, 4:30 PM PDT; "now" is two days earlier.
  const original = at("2026-10-24T23:30:00Z");
  assert.equal(nextOccurrenceOf(original, at("2026-10-22T20:00:00Z")).toISOString(), "2026-10-31T23:30:00.000Z");
});

test("a past session rebooks at the next same-time slot still ahead", () => {
  // Original: Sat 2026-10-03, 4:30 PM PDT. Now: Thu 2026-10-22 → next is Sat 10-24.
  assert.equal(nextOccurrenceOf(at("2026-10-03T23:30:00Z"), at("2026-10-22T20:00:00Z")).toISOString(), "2026-10-24T23:30:00.000Z");
  // Same weekday, but that day's slot has already passed → the week after.
  assert.equal(nextOccurrenceOf(at("2026-10-03T23:30:00Z"), at("2026-10-24T23:45:00Z")).toISOString(), "2026-10-31T23:30:00.000Z");
});

test("the Pacific clock time holds across the November clock change", () => {
  // Sat 2026-10-31, 4:30 PM PDT (UTC-7) → Sat 2026-11-07, 4:30 PM PST (UTC-8), not 3:30 PM.
  assert.equal(nextOccurrenceOf(at("2026-10-31T23:30:00Z"), at("2026-10-31T00:00:00Z")).toISOString(), "2026-11-08T00:30:00.000Z");
});

test("and across the March clock change", () => {
  // Sat 2027-03-13, 9:00 AM PST (UTC-8) → Sat 2027-03-20, 9:00 AM PDT (UTC-7).
  assert.equal(nextOccurrenceOf(at("2027-03-13T17:00:00Z"), at("2027-03-13T00:00:00Z")).toISOString(), "2027-03-20T16:00:00.000Z");
});

test("several weeks in a row, for skipping weeks the parent already has", () => {
  assert.deepEqual(isoList(nextOccurrences(at("2026-10-24T23:30:00Z"), at("2026-10-22T20:00:00Z"), 3)), [
    "2026-10-31T23:30:00.000Z",
    "2026-11-08T00:30:00.000Z",
    "2026-11-15T00:30:00.000Z",
  ]);
});

test("an old session doesn't walk week by week from the past", () => {
  // Two years back still lands on the next occurrence after now.
  const r = nextOccurrenceOf(at("2024-10-26T23:30:00Z"), at("2026-10-22T20:00:00Z"));
  assert.equal(r.toISOString(), "2026-10-24T23:30:00.000Z");
});
