import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCalendarDate,
  dateReachingAge,
  coachAgeBand,
  todayInPacific,
  ageInWholeYears,
  formatCalendarDate,
  MIN_COACH_AGE,
  ADULT_AGE,
  type CalendarDate,
} from "./age";
import { evaluateCoachAgeEligibility } from "./coach";
import { coachRegisterSchema } from "./validation";

const d = (s: string): CalendarDate => parseCalendarDate(s)!;
const ON = { minorCoachesEnabled: true };
const OFF = { minorCoachesEnabled: false };

test("parseCalendarDate accepts real dates only", () => {
  assert.deepEqual(parseCalendarDate("2010-04-15"), { year: 2010, month: 4, day: 15 });
  assert.deepEqual(parseCalendarDate("2008-02-29"), { year: 2008, month: 2, day: 29 });
  assert.equal(parseCalendarDate("2009-02-29"), null); // not a leap year
  assert.equal(parseCalendarDate("2010-13-01"), null);
  assert.equal(parseCalendarDate("2010-04-31"), null);
  assert.equal(parseCalendarDate("04/15/2010"), null);
  assert.equal(parseCalendarDate(""), null);
});

test("15 years 11 months is rejected (tier on)", () => {
  const r = evaluateCoachAgeEligibility(d("2010-11-07"), { today: d("2026-10-07"), ...ON });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.code, "TOO_YOUNG");
  assert.match(!r.ok ? r.reason : "", /at least 16 years old/);
  assert.match(!r.ok ? r.reason : "", /November 7, 2026/);
});

test("the day before the 16th birthday is rejected; the 16th birthday is accepted into the Minor Coach flow", () => {
  const birth = d("2010-10-07");
  const dayBefore = evaluateCoachAgeEligibility(birth, { today: d("2026-10-06"), ...ON });
  assert.equal(!dayBefore.ok && dayBefore.code, "TOO_YOUNG");
  assert.deepEqual(evaluateCoachAgeEligibility(birth, { today: d("2026-10-07"), ...ON }), { ok: true, isMinor: true });
});

test("the day before the 18th birthday is a minor; the 18th birthday is the adult flow", () => {
  const birth = d("2008-10-08");
  assert.deepEqual(evaluateCoachAgeEligibility(birth, { today: d("2026-10-07"), ...ON }), { ok: true, isMinor: true });
  assert.deepEqual(evaluateCoachAgeEligibility(birth, { today: d("2026-10-08"), ...ON }), { ok: true, isMinor: false });
});

test("18th birthday and older are unchanged whether the tier is on or off", () => {
  for (const flags of [ON, OFF]) {
    assert.deepEqual(evaluateCoachAgeEligibility(d("2008-10-07"), { today: d("2026-10-07"), ...flags }), { ok: true, isMinor: false });
    assert.deepEqual(evaluateCoachAgeEligibility(d("1990-01-01"), { today: d("2026-10-07"), ...flags }), { ok: true, isMinor: false });
  }
});

test("Feb 29 birthday: 18th birthday falls on Mar 1 in a non-leap year", () => {
  const birth = d("2008-02-29");
  assert.deepEqual(dateReachingAge(birth, ADULT_AGE), d("2026-03-01"));
  assert.deepEqual(evaluateCoachAgeEligibility(birth, { today: d("2026-02-28"), ...ON }), { ok: true, isMinor: true });
  assert.deepEqual(evaluateCoachAgeEligibility(birth, { today: d("2026-03-01"), ...ON }), { ok: true, isMinor: false });
  assert.equal(ageInWholeYears(birth, d("2026-02-28")), 17);
  assert.equal(ageInWholeYears(birth, d("2026-03-01")), 18);
});

test("Feb 29 birthday: the 16th birthday is Feb 29 again (16 years on is a leap year)", () => {
  const birth = d("2012-02-29");
  assert.deepEqual(dateReachingAge(birth, MIN_COACH_AGE), d("2028-02-29"));
  assert.equal(!evaluateCoachAgeEligibility(birth, { today: d("2028-02-28"), ...ON }).ok, true);
  assert.deepEqual(evaluateCoachAgeEligibility(birth, { today: d("2028-02-29"), ...ON }), { ok: true, isMinor: true });
  assert.equal(coachAgeBand(birth, d("2028-02-28")).band, "TOO_YOUNG");
  // ...except across a skipped century leap year: 2100 has no Feb 29, so it's Mar 1.
  assert.deepEqual(dateReachingAge(d("2084-02-29"), MIN_COACH_AGE), d("2100-03-01"));
});

// dateReachingAge also takes months; the age rules don't use them today, but the helper should stay right.
const SIX_MONTHS = { years: 0, months: 6 };

test("Aug 31 + 6 months rolls to Mar 1 (no Feb 31), in leap and non-leap years", () => {
  assert.deepEqual(dateReachingAge(d("2010-08-31"), SIX_MONTHS), d("2011-03-01"));
  assert.deepEqual(dateReachingAge(d("2011-08-31"), SIX_MONTHS), d("2012-03-01")); // 2012 is a leap year: no Feb 31 either
  assert.deepEqual(dateReachingAge(d("2011-08-29"), SIX_MONTHS), d("2012-02-29"));
});

test("month arithmetic crosses the year boundary", () => {
  assert.deepEqual(dateReachingAge(d("2010-09-15"), SIX_MONTHS), d("2011-03-15"));
  assert.deepEqual(dateReachingAge(d("2010-07-31"), SIX_MONTHS), d("2011-01-31"));
});

test("under 18 with the tier off gets the friendly not-yet message, never TOO_YOUNG", () => {
  for (const birth of ["2009-01-01", "2011-04-07", "2011-06-07", "2014-01-01"]) {
    const r = evaluateCoachAgeEligibility(d(birth), { today: d("2026-10-07"), ...OFF });
    assert.equal(r.ok, false, birth);
    assert.equal(!r.ok && r.code, "UNDER_18_NOT_ACCEPTED", birth);
    assert.match(!r.ok ? r.reason : "", /isn't accepting coaches under 18 yet/);
  }
  const r = evaluateCoachAgeEligibility(d("2009-01-01"), { today: d("2026-10-07"), ...OFF });
  assert.match(!r.ok ? r.reason : "", /January 1, 2027/);
});

test("'today' is the Pacific calendar date, not UTC", () => {
  // 2026-03-01 07:30 UTC is still Feb 28, 11:30 PM in Pacific (PST, UTC-8).
  assert.equal(formatCalendarDate(todayInPacific(new Date("2026-03-01T07:30:00Z"))), "2026-02-28");
  assert.equal(formatCalendarDate(todayInPacific(new Date("2026-03-01T08:30:00Z"))), "2026-03-01");
  // Someone born Mar 1, 2008 is still 17 at that first instant.
  const birth = d("2008-03-01");
  assert.equal(coachAgeBand(birth, todayInPacific(new Date("2026-03-01T07:30:00Z"))).band, "MINOR");
  assert.equal(coachAgeBand(birth, todayInPacific(new Date("2026-03-01T08:30:00Z"))).band, "ADULT");
});

test("signup schema rejects malformed and future dates of birth", () => {
  const base = { name: "Test Coach", email: "t@example.com", password: "password123", zip: "94103" };
  assert.equal(coachRegisterSchema.safeParse({ ...base, dateOfBirth: "2009-02-29" }).success, false);
  assert.equal(coachRegisterSchema.safeParse({ ...base, dateOfBirth: "2999-01-01" }).success, false);
  assert.equal(coachRegisterSchema.safeParse({ ...base, dateOfBirth: "not a date" }).success, false);
  const ok = coachRegisterSchema.safeParse({ ...base, dateOfBirth: "2010-04-15" });
  assert.equal(ok.success, true);
  assert.deepEqual(ok.success && ok.data.dateOfBirth, { year: 2010, month: 4, day: 15 });
});
