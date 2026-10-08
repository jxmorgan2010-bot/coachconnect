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

test("15 years 4 months is rejected (tier on)", () => {
  const r = evaluateCoachAgeEligibility(d("2011-06-07"), { today: d("2026-10-07"), ...ON });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.code, "TOO_YOUNG");
  assert.match(!r.ok ? r.reason : "", /15 years and 6 months/);
  assert.match(!r.ok ? r.reason : "", /December 7, 2026/);
});

test("exactly 15 years 6 months is accepted into the Minor Coach flow; the day before is not", () => {
  const birth = d("2011-04-07");
  assert.deepEqual(evaluateCoachAgeEligibility(birth, { today: d("2026-10-07"), ...ON }), { ok: true, isMinor: true });
  const dayBefore = evaluateCoachAgeEligibility(birth, { today: d("2026-10-06"), ...ON });
  assert.equal(!dayBefore.ok && dayBefore.code, "TOO_YOUNG");
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

test("Feb 29 birthday: 15y6m lands on Aug 29, which always exists", () => {
  const birth = d("2012-02-29");
  assert.deepEqual(dateReachingAge(birth, MIN_COACH_AGE), d("2027-08-29"));
  assert.equal(coachAgeBand(birth, d("2027-08-28")).band, "TOO_YOUNG");
  assert.equal(coachAgeBand(birth, d("2027-08-29")).band, "MINOR");
});

test("Aug 31 + 6 months rolls to Mar 1 (no Feb 31), in leap and non-leap years", () => {
  assert.deepEqual(dateReachingAge(d("2010-08-31"), MIN_COACH_AGE), d("2026-03-01"));
  assert.equal(coachAgeBand(d("2010-08-31"), d("2026-02-28")).band, "TOO_YOUNG");
  assert.equal(coachAgeBand(d("2010-08-31"), d("2026-03-01")).band, "MINOR");
  assert.deepEqual(dateReachingAge(d("2012-08-31"), MIN_COACH_AGE), d("2028-03-01")); // 2028 is a leap year: no Feb 31 either
  assert.deepEqual(dateReachingAge(d("2012-08-29"), MIN_COACH_AGE), d("2028-02-29"));
});

test("month arithmetic crosses the year boundary", () => {
  assert.deepEqual(dateReachingAge(d("2010-09-15"), MIN_COACH_AGE), d("2026-03-15"));
  assert.deepEqual(dateReachingAge(d("2010-07-31"), MIN_COACH_AGE), d("2026-01-31"));
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
