import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCalendarDate, type CalendarDate } from "./age";
import { evaluateCoachAgeEligibility, isCoachProfileComplete } from "./coach";
import { coachKindLabel, idDocumentLabel, isGovernmentIdType } from "./coachTypes";
import { coachProfileSchema, coachRegisterSchema, experiencedCoachProfileSchema } from "./validation";

const d = (s: string): CalendarDate => parseCalendarDate(s)!;
const TODAY = d("2026-10-25");

test("experienced coaches must be 18, even with the Minor Coach tier on", () => {
  for (const minorCoachesEnabled of [false, true]) {
    const r = evaluateCoachAgeEligibility(d("2010-01-01"), { today: TODAY, minorCoachesEnabled, coachType: "EXPERIENCED" });
    assert.equal(!r.ok && r.code, "EXPERIENCED_UNDER_18");
    assert.match(!r.ok ? r.reason : "", /18 or older.*January 1, 2028/);
  }
  // The day they turn 18, and much older: no upper limit.
  assert.deepEqual(evaluateCoachAgeEligibility(d("2008-10-25"), { today: TODAY, coachType: "EXPERIENCED" }), { ok: true, isMinor: false });
  assert.deepEqual(evaluateCoachAgeEligibility(d("1950-06-01"), { today: TODAY, coachType: "EXPERIENCED" }), { ok: true, isMinor: false });
  // Student-athletes keep the existing rules.
  assert.deepEqual(
    evaluateCoachAgeEligibility(d("2010-01-01"), { today: TODAY, minorCoachesEnabled: true, coachType: "STUDENT_ATHLETE" }),
    { ok: true, isMinor: true },
  );
});

test("signup without a coach type is a student-athlete", () => {
  const base = { name: "Sam Lee", email: "sam@example.com", password: "password123", dateOfBirth: "1990-01-01", zip: "94103" };
  assert.equal(coachRegisterSchema.parse(base).coachType, "STUDENT_ATHLETE");
  assert.equal(coachRegisterSchema.parse({ ...base, coachType: "EXPERIENCED" }).coachType, "EXPERIENCED");
  assert.equal(coachRegisterSchema.safeParse({ ...base, coachType: "PRO" }).success, false);
});

const shared = {
  bio: "I've coached rec league soccer for eight years and ran a U12 travel team.",
  hourlyRateDollars: 45,
  city: "San Francisco",
  state: "CA",
  zip: "94103",
  sports: ["SOCCER"],
  sportLevels: [{ sport: "SOCCER", levels: ["BEGINNER"] }],
};

test("experienced profile: no school fields, experience fields optional", () => {
  const bare = experiencedCoachProfileSchema.safeParse({ ...shared, yearsCoaching: "", certifications: "  ", playingHistory: "" });
  assert.equal(bare.success, true);
  assert.deepEqual(
    { y: bare.data!.yearsCoaching, c: bare.data!.certifications, p: bare.data!.playingHistory },
    { y: null, c: null, p: null },
  );
  const full = experiencedCoachProfileSchema.parse({ ...shared, yearsCoaching: "8", certifications: "US Soccer D license", playingHistory: "Club soccer" });
  assert.equal(full.yearsCoaching, 8);
  assert.equal(experiencedCoachProfileSchema.parse({ ...shared, yearsCoaching: "0" }).yearsCoaching, 0);
  assert.equal(experiencedCoachProfileSchema.safeParse({ ...shared, yearsCoaching: "61" }).success, false);
  assert.equal(experiencedCoachProfileSchema.safeParse({ ...shared, yearsCoaching: "2.5" }).success, false);
  assert.equal(experiencedCoachProfileSchema.safeParse({ ...shared, certifications: "x".repeat(301) }).success, false);
  // Experienced coaches can't slip school fields in; student-athletes still need them.
  assert.equal("schoolName" in experiencedCoachProfileSchema.parse({ ...shared, schoolName: "Lowell" }), false);
  assert.equal(coachProfileSchema.safeParse(shared).success, false);
});

test("profile completeness depends on the coach type", () => {
  const base = { bio: "Bio", hourlyRateCents: 4000, city: "San Francisco", state: "CA", schoolLevel: null, schoolName: null, gradYear: null };
  assert.equal(isCoachProfileComplete({ ...base, coachType: "EXPERIENCED" }), true);
  assert.equal(isCoachProfileComplete({ ...base, coachType: "STUDENT_ATHLETE" }), false);
  assert.equal(
    isCoachProfileComplete({ ...base, coachType: "STUDENT_ATHLETE", schoolLevel: "COLLEGE", schoolName: "SF State", gradYear: 2028 }),
    true,
  );
});

test("the line under a coach's name never calls an experienced coach a school athlete", () => {
  assert.equal(coachKindLabel({ coachType: "STUDENT_ATHLETE", schoolLevel: "COLLEGE" }), "College athlete");
  assert.equal(coachKindLabel({ coachType: "STUDENT_ATHLETE", schoolLevel: "HIGH_SCHOOL" }), "High school athlete");
  assert.equal(coachKindLabel({ coachType: "EXPERIENCED", schoolLevel: null }, { experiencedCoachesEnabled: true }), "Experienced coach");
  assert.equal(coachKindLabel({ coachType: "EXPERIENCED", schoolLevel: null }, { experiencedCoachesEnabled: false }), null);
});

test("ID types", () => {
  assert.equal(idDocumentLabel({ coachType: "STUDENT_ATHLETE", idDocumentType: null }), "School ID");
  assert.equal(idDocumentLabel({ coachType: "EXPERIENCED", idDocumentType: "PASSPORT" }), "Passport");
  assert.equal(idDocumentLabel({ coachType: "EXPERIENCED", idDocumentType: null }), "Type not recorded");
  assert.equal(isGovernmentIdType("DRIVERS_LICENSE"), true);
  assert.equal(isGovernmentIdType("SCHOOL_ID"), false);
});
