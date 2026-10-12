/**
 * Database tests for skill levels across every booking path. They write rows, so they refuse
 * to run unless pointed at a scratch database copy:
 *
 *   DATABASE_URL=file:/path/to/scratch-copy.db SKILL_LEVELS_DB_TEST=1 \
 *   npx tsx --test src/lib/skillLevels.db-test.ts
 *
 * The scratch copy needs prisma/sql/2026-10-07-minor-coach-consent.sql and
 * prisma/sql/2026-10-12-skill-levels.sql applied first.
 * Not matched by `npm test` (*.test.ts), so the normal suite never touches a database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import {
  validateBookingRequest,
  validatePackageBookingRequest,
  createConfirmedBooking,
  BookingValidationError,
  LEVEL_REQUIRED,
  LEVEL_NOT_ACCEPTED,
} from "./bookingValidation";
import { flagsFromLevels, levelsFromFlags } from "./skillLevels";
import type { ParentProfile, SkillLevel, Sport } from "@/generated/prisma/client";

const url = process.env.DATABASE_URL ?? "";
if (process.env.SKILL_LEVELS_DB_TEST !== "1" || !url.startsWith("file:") || /(^|[\\/:])dev\.db$/.test(url)) {
  throw new Error("Refusing to run: set SKILL_LEVELS_DB_TEST=1 and point DATABASE_URL at a scratch copy (not dev.db).");
}

const DAY = 24 * 60 * 60 * 1000;
const LOCATION = "Mission Playground field";

// Each test books a different day, so validations never collide with each other's bookings.
let dayOffset = 2;
/** 18:00 UTC (10 or 11am Pacific), `dayOffset` days out: inside the all-day hours below, on the 30-minute grid. */
function nextSlot(): Date {
  const d = new Date(Date.now() + dayOffset++ * DAY);
  d.setUTCHours(18, 0, 0, 0);
  return d;
}

/** A live adult coach, open all day every day, coaching `sport` at `levels` (undefined = all, via the column default). */
async function makeCoach(sport: Sport, levels?: SkillLevel[]) {
  const user = await prisma.user.create({
    data: {
      name: "Sam Coach",
      email: `coach-${randomUUID()}@example.test`,
      passwordHash: "x",
      role: "COACH",
      coachProfile: {
        create: {
          hourlyRateCents: 4000,
          idVerificationStatus: "APPROVED",
          backgroundCheckStatus: "CLEAR",
          backgroundCheckExpiresAt: new Date(Date.now() + 300 * DAY),
          availability: { create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startMinute: 0, endMinute: 1440 })) },
          sports: { create: { sport, ...(levels ? flagsFromLevels(levels) : {}) } },
        },
      },
    },
    include: { coachProfile: true },
  });
  return user.coachProfile!;
}

async function makeParent(): Promise<ParentProfile> {
  const user = await prisma.user.create({
    data: {
      name: "Pat Parent",
      email: `parent-${randomUUID()}@example.test`,
      passwordHash: "x",
      role: "PARENT",
      parentProfile: { create: { referralCode: `T${randomUUID().slice(0, 10)}` } },
    },
    include: { parentProfile: true },
  });
  return user.parentProfile!;
}

async function makeChild(parent: ParentProfile, firstName: string, levels: Partial<Record<Sport, SkillLevel>> = {}) {
  return prisma.child.create({
    data: {
      parentProfileId: parent.id,
      firstName,
      gradeOrAge: "age 11",
      sportLevels: { create: Object.entries(levels).map(([sport, level]) => ({ sport: sport as Sport, level: level! })) },
    },
  });
}

async function makePackage(parent: ParentProfile, coachProfileId: string, sport: Sport) {
  return prisma.sessionPackage.create({
    data: {
      parentProfileId: parent.id,
      coachProfileId,
      sport,
      durationMinutes: 60,
      totalSessions: 5,
      pricePerSessionCents: 4000,
      discountPercent: 10,
      totalChargedCents: 18000,
    },
  });
}

async function rejectsWithCode(promise: Promise<unknown>, code: string, pattern?: RegExp) {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof BookingValidationError, `expected BookingValidationError, got ${err}`);
    assert.equal(err.code, code);
    assert.equal(err.status, 400);
    if (pattern) assert.match(err.message, pattern);
    return true;
  });
}

function single(coachProfileId: string, childId: string, sport: Sport) {
  return { coachProfileId, childId, sport, scheduledAt: nextSlot(), durationMinutes: 60, locationText: LOCATION };
}

// ---------------------------------------------------------------------------------------
// Existing coaches

test("a CoachSport row written without the level columns (an existing coach) takes every level", async () => {
  const coach = await makeCoach("BASKETBALL");
  const id = `legacy-${randomUUID()}`;
  // Exactly what pre-existing rows look like: only the original columns were ever written.
  await prisma.$executeRawUnsafe(`INSERT INTO "CoachSport" ("id", "coachProfileId", "sport") VALUES (?, ?, 'TENNIS')`, id, coach.id);
  const row = await prisma.coachSport.findUniqueOrThrow({ where: { id } });
  assert.deepEqual(levelsFromFlags(row), ["BEGINNER", "INTERMEDIATE", "ADVANCED", "COMPETITIVE"]);

  const parent = await makeParent();
  for (const level of ["BEGINNER", "COMPETITIVE"] as const) {
    const kid = await makeChild(parent, `Kid${level}`, { TENNIS: level });
    const ok = await validateBookingRequest(parent, single(coach.id, kid.id, "TENNIS"));
    assert.equal(ok.childLevel, level);
  }
});

// ---------------------------------------------------------------------------------------
// Single bookings (also the path quick rebook validates through)

test("single booking: matching level passes and returns the level", async () => {
  const coach = await makeCoach("SOCCER", ["INTERMEDIATE", "ADVANCED"]);
  const parent = await makeParent();
  const maya = await makeChild(parent, "Maya", { SOCCER: "ADVANCED" });
  const ok = await validateBookingRequest(parent, single(coach.id, maya.id, "SOCCER"));
  assert.equal(ok.childLevel, "ADVANCED");
});

test("single booking: mismatched level is rejected with a clear message", async () => {
  const coach = await makeCoach("SOCCER", ["ADVANCED", "COMPETITIVE"]);
  const parent = await makeParent();
  const jo = await makeChild(parent, "Jo", { SOCCER: "BEGINNER" });
  await rejectsWithCode(
    validateBookingRequest(parent, single(coach.id, jo.id, "SOCCER")),
    LEVEL_NOT_ACCEPTED,
    /takes Advanced and Competitive soccer players, and Jo is set to Beginner/,
  );
});

test("single booking: a level for a different sport doesn't count", async () => {
  const coach = await makeCoach("SOCCER");
  const parent = await makeParent();
  const kid = await makeChild(parent, "Ari", { TENNIS: "ADVANCED" });
  await rejectsWithCode(validateBookingRequest(parent, single(coach.id, kid.id, "SOCCER")), LEVEL_REQUIRED, /Set Ari's soccer level/);
});

test("single booking: a child with no level is asked for one", async () => {
  const coach = await makeCoach("SOCCER");
  const parent = await makeParent();
  const kid = await makeChild(parent, "Noa");
  await rejectsWithCode(validateBookingRequest(parent, single(coach.id, kid.id, "SOCCER")), LEVEL_REQUIRED, /Set Noa's soccer level before booking/);

  // Once the parent sets it (what PUT /api/children/[id]/levels does), the same request passes.
  await prisma.childSportLevel.create({ data: { childId: kid.id, sport: "SOCCER", level: "BEGINNER" } });
  const ok = await validateBookingRequest(parent, single(coach.id, kid.id, "SOCCER"));
  assert.equal(ok.childLevel, "BEGINNER");
});

test("createConfirmedBooking stores the child's level on the booking", async () => {
  const coach = await makeCoach("LACROSSE", ["BEGINNER"]);
  const parent = await makeParent();
  const kid = await makeChild(parent, "Lee", { LACROSSE: "BEGINNER" });
  const req = single(coach.id, kid.id, "LACROSSE");
  const v = await validateBookingRequest(parent, req);
  const booking = await createConfirmedBooking({
    parentProfileId: parent.id,
    coachProfileId: coach.id,
    childId: kid.id,
    childLevel: v.childLevel,
    sport: v.sport,
    scheduledAt: req.scheduledAt,
    durationMinutes: 60,
    locationText: LOCATION,
    priceCents: v.breakdown.sessionCostCents,
    platformFeeCents: v.breakdown.platformFeeCents,
    discountCents: 0,
    isFirstSession: v.isFirstSession,
    stripePaymentIntentId: `pi_test_${randomUUID()}`,
    stripePaymentMethodId: null,
  });
  assert.ok(booking);
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).childLevel, "BEGINNER");
});

// ---------------------------------------------------------------------------------------
// Quick rebook: the route re-validates the prior booking's coach/child/sport through
// validateBookingRequest, so a level change since the last session is caught.

test("quick rebook: same inputs as a prior booking pass while the level still fits, fail once it doesn't", async () => {
  const coach = await makeCoach("BASEBALL", ["INTERMEDIATE"]);
  const parent = await makeParent();
  const kid = await makeChild(parent, "Rio", { BASEBALL: "INTERMEDIATE" });
  const prior = { coachProfileId: coach.id, childId: kid.id, sport: "BASEBALL" as Sport, durationMinutes: 60, locationText: LOCATION };

  const ok = await validateBookingRequest(parent, { ...prior, scheduledAt: nextSlot() });
  assert.equal(ok.childLevel, "INTERMEDIATE");

  await prisma.childSportLevel.update({ where: { childId_sport: { childId: kid.id, sport: "BASEBALL" } }, data: { level: "COMPETITIVE" } });
  await rejectsWithCode(validateBookingRequest(parent, { ...prior, scheduledAt: nextSlot() }), LEVEL_NOT_ACCEPTED);
});

test("quick rebook: a child from before levels existed is asked for one (LEVEL_REQUIRED)", async () => {
  const coach = await makeCoach("BASEBALL");
  const parent = await makeParent();
  const kid = await makeChild(parent, "Sol");
  await rejectsWithCode(
    validateBookingRequest(parent, { coachProfileId: coach.id, childId: kid.id, sport: "BASEBALL", scheduledAt: nextSlot(), durationMinutes: 60, locationText: LOCATION }),
    LEVEL_REQUIRED,
  );
});

// ---------------------------------------------------------------------------------------
// Package bookings

function fromPackage(packageId: string, childId: string) {
  return { packageId, childId, scheduledAt: nextSlot(), locationText: LOCATION };
}

test("package booking: matching level passes, mismatch and missing level are rejected", async () => {
  const coach = await makeCoach("TENNIS", ["BEGINNER", "INTERMEDIATE"]);
  const parent = await makeParent();
  const pkg = await makePackage(parent, coach.id, "TENNIS");
  const fits = await makeChild(parent, "Fits", { TENNIS: "INTERMEDIATE" });
  const tooHigh = await makeChild(parent, "High", { TENNIS: "COMPETITIVE" });
  const unset = await makeChild(parent, "Unset");

  const ok = await validatePackageBookingRequest(parent, fromPackage(pkg.id, fits.id));
  assert.equal(ok.childLevel, "INTERMEDIATE");
  await rejectsWithCode(validatePackageBookingRequest(parent, fromPackage(pkg.id, tooHigh.id)), LEVEL_NOT_ACCEPTED, /High is set to Competitive/);
  await rejectsWithCode(validatePackageBookingRequest(parent, fromPackage(pkg.id, unset.id)), LEVEL_REQUIRED);
});

test("package booking: a kid who already used the package keeps using it after the coach narrows levels; a sibling doesn't", async () => {
  const coach = await makeCoach("PICKLEBALL", ["BEGINNER", "INTERMEDIATE"]);
  const parent = await makeParent();
  const pkg = await makePackage(parent, coach.id, "PICKLEBALL");
  const used = await makeChild(parent, "Used", { PICKLEBALL: "BEGINNER" });
  const sibling = await makeChild(parent, "Sib", { PICKLEBALL: "BEGINNER" });

  await prisma.booking.create({
    data: {
      parentProfileId: parent.id,
      coachProfileId: coach.id,
      childId: used.id,
      childLevel: "BEGINNER",
      sport: "PICKLEBALL",
      scheduledAt: new Date(Date.now() - 3 * DAY),
      durationMinutes: 60,
      locationText: LOCATION,
      priceCents: 3600,
      platformFeeCents: 540,
      status: "COMPLETED",
      paymentStatus: "CAPTURED",
      packageId: pkg.id,
    },
  });
  // The coach stops taking beginners after the package was bought.
  await prisma.coachSport.update({
    where: { coachProfileId_sport: { coachProfileId: coach.id, sport: "PICKLEBALL" } },
    data: flagsFromLevels(["INTERMEDIATE"]),
  });

  const ok = await validatePackageBookingRequest(parent, fromPackage(pkg.id, used.id));
  assert.equal(ok.childLevel, "BEGINNER");
  await rejectsWithCode(validatePackageBookingRequest(parent, fromPackage(pkg.id, sibling.id)), LEVEL_NOT_ACCEPTED);
  // The grandfathering is package-specific: a single booking for the same kid is still checked.
  await rejectsWithCode(validateBookingRequest(parent, single(coach.id, used.id, "PICKLEBALL")), LEVEL_NOT_ACCEPTED);
});

test("package booking: still works if the coach has dropped the package's sport (unchanged behavior), level still required", async () => {
  const coach = await makeCoach("FOOTBALL");
  const parent = await makeParent();
  const pkg = await makePackage(parent, coach.id, "SOFTBALL"); // the coach no longer lists softball
  const kid = await makeChild(parent, "Kai", { SOFTBALL: "ADVANCED" });
  const ok = await validatePackageBookingRequest(parent, fromPackage(pkg.id, kid.id));
  assert.equal(ok.childLevel, "ADVANCED");
  const unset = await makeChild(parent, "Una");
  await rejectsWithCode(validatePackageBookingRequest(parent, fromPackage(pkg.id, unset.id)), LEVEL_REQUIRED);
});
