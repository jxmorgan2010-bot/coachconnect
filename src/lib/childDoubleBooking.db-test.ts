/**
 * Database tests for the one-session-at-a-time rule for a child, across coaches and booking paths.
 * They write rows, so they refuse to run unless pointed at a scratch database copy:
 *
 *   DATABASE_URL=file:/path/to/scratch-copy.db CHILD_BOOKING_DB_TEST=1 \
 *   npx tsx --test src/lib/childDoubleBooking.db-test.ts
 *
 * No Stripe call is made: these use validation and createConfirmedBooking directly, with fake ids.
 * Not matched by `npm test` (*.test.ts), so the normal suite never touches a database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";

const url = process.env.DATABASE_URL ?? "";
if (process.env.CHILD_BOOKING_DB_TEST !== "1" || !url.startsWith("file:") || /(^|[\\/:])dev\.db$/.test(url)) {
  throw new Error("Refusing to run: set CHILD_BOOKING_DB_TEST=1 and point DATABASE_URL at a scratch copy (not dev.db).");
}

import { prisma } from "./prisma";
import {
  validateBookingRequest,
  validatePackageBookingRequest,
  createConfirmedBooking,
  ChildBusyError,
  CHILD_BUSY,
} from "./bookingValidation";
import type { ParentProfile, Sport } from "@/generated/prisma/client";

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const LOCATION = "Mission Playground field";

let dayOffset = 3;
/** 18:00 UTC, a fresh day per test so tests never see each other's bookings. */
function freshSlot(): Date {
  const d = new Date(Date.now() + dayOffset++ * DAY);
  d.setUTCHours(18, 0, 0, 0);
  return d;
}

async function makeCoach(name: string, sport: Sport = "SOCCER") {
  const user = await prisma.user.create({
    data: {
      name,
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
          sports: { create: { sport } },
        },
      },
    },
    include: { coachProfile: true },
  });
  return user.coachProfile!;
}

async function makeFamily() {
  const user = await prisma.user.create({
    data: {
      name: "Pat Parent",
      email: `parent-${randomUUID()}@example.test`,
      passwordHash: "x",
      role: "PARENT",
      parentProfile: { create: { referralCode: `C${randomUUID().slice(0, 10)}` } },
    },
    include: { parentProfile: true },
  });
  const parent = user.parentProfile!;
  const child = (firstName: string) =>
    prisma.child.create({
      data: {
        parentProfileId: parent.id,
        firstName,
        gradeOrAge: "age 11",
        sportLevels: { create: [{ sport: "SOCCER", level: "BEGINNER" }, { sport: "TENNIS", level: "BEGINNER" }] },
      },
    });
  return { parent, alex: await child("Alex"), sam: await child("Sam") };
}

/** An existing session, written directly (as if booked earlier). */
async function existing(parent: ParentProfile, coachProfileId: string, childId: string, scheduledAt: Date, over: { durationMinutes?: number; status?: "CONFIRMED" | "CANCELLED"; sport?: Sport } = {}) {
  return prisma.booking.create({
    data: {
      parentProfileId: parent.id,
      coachProfileId,
      childId,
      sport: over.sport ?? "TENNIS",
      scheduledAt,
      durationMinutes: over.durationMinutes ?? 60,
      locationText: LOCATION,
      priceCents: 4000,
      platformFeeCents: 600,
      status: over.status ?? "CONFIRMED",
    },
  });
}

function request(coachProfileId: string, childId: string, scheduledAt: Date) {
  return { coachProfileId, childId, sport: "SOCCER", scheduledAt, durationMinutes: 60, locationText: LOCATION };
}

async function rejectsChildBusy(promise: Promise<unknown>, pattern?: RegExp) {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof ChildBusyError, `expected ChildBusyError, got ${err}`);
    assert.equal(err.code, CHILD_BUSY);
    assert.equal(err.status, 409);
    if (pattern) assert.match(err.message, pattern);
    return true;
  });
}

test("single booking: an overlapping session with another coach is rejected, naming the clash", async () => {
  const [casey, priya] = [await makeCoach("Casey Lee", "TENNIS"), await makeCoach("Priya Shah")];
  const { parent, alex } = await makeFamily();
  const t = freshSlot();
  await existing(parent, casey.id, alex.id, t);
  await rejectsChildBusy(validateBookingRequest(parent, request(priya.id, alex.id, t)), /^Alex already has a session then: Tennis with Casey Lee, .+ PT\. Pick another time\.$/);
  // Partial overlap: 30 minutes into the other session.
  await rejectsChildBusy(validateBookingRequest(parent, request(priya.id, alex.id, new Date(t.getTime() + 30 * MIN))));
  // Starting 30 minutes before, ending inside it.
  await rejectsChildBusy(validateBookingRequest(parent, request(priya.id, alex.id, new Date(t.getTime() - 30 * MIN))));
});

test("allowed: back-to-back, a cancelled session, or a sibling at the same time", async () => {
  const [casey, priya] = [await makeCoach("Casey Lee", "TENNIS"), await makeCoach("Priya Shah")];
  const { parent, alex, sam } = await makeFamily();
  const t = freshSlot();
  await existing(parent, casey.id, alex.id, t);
  await validateBookingRequest(parent, request(priya.id, alex.id, new Date(t.getTime() + 60 * MIN))); // starts as it ends
  await validateBookingRequest(parent, request(priya.id, alex.id, new Date(t.getTime() - 60 * MIN))); // ends as it starts
  await validateBookingRequest(parent, request(priya.id, sam.id, t)); // a different child

  const t2 = freshSlot();
  await existing(parent, casey.id, alex.id, t2, { status: "CANCELLED" });
  await validateBookingRequest(parent, request(priya.id, alex.id, t2));
});

test("a long earlier session that runs into the requested time still counts", async () => {
  const [casey, priya] = [await makeCoach("Casey Lee", "TENNIS"), await makeCoach("Priya Shah")];
  const { parent, alex } = await makeFamily();
  const t = freshSlot();
  await existing(parent, casey.id, alex.id, new Date(t.getTime() - 90 * MIN), { durationMinutes: 120 });
  await rejectsChildBusy(validateBookingRequest(parent, request(priya.id, alex.id, t)));
});

test("package session: rejected the same way", async () => {
  const [casey, priya] = [await makeCoach("Casey Lee", "TENNIS"), await makeCoach("Priya Shah")];
  const { parent, alex } = await makeFamily();
  const pkg = await prisma.sessionPackage.create({
    data: { parentProfileId: parent.id, coachProfileId: priya.id, sport: "SOCCER", durationMinutes: 60, totalSessions: 5, pricePerSessionCents: 4000, discountPercent: 10, totalChargedCents: 18000 },
  });
  const t = freshSlot();
  await existing(parent, casey.id, alex.id, t);
  await rejectsChildBusy(validatePackageBookingRequest(parent, { packageId: pkg.id, childId: alex.id, scheduledAt: t, locationText: LOCATION }), /Alex already has a session then/);
  await validatePackageBookingRequest(parent, { packageId: pkg.id, childId: alex.id, scheduledAt: new Date(t.getTime() + 2 * 60 * MIN), locationText: LOCATION });
});

function confirmedInput(parent: ParentProfile, coachProfileId: string, childId: string, scheduledAt: Date) {
  return {
    parentProfileId: parent.id,
    coachProfileId,
    childId,
    childLevel: "BEGINNER" as const,
    sport: "SOCCER" as const,
    scheduledAt,
    durationMinutes: 60,
    locationText: LOCATION,
    priceCents: 4000,
    platformFeeCents: 600,
    discountCents: 0,
    isFirstSession: false,
    stripePaymentIntentId: `pi_test_${randomUUID()}`,
    stripePaymentMethodId: null,
  };
}

test("race: the write transaction re-checks the child and reports CHILD_BUSY without creating anything", async () => {
  const [casey, priya] = [await makeCoach("Casey Lee", "TENNIS"), await makeCoach("Priya Shah")];
  const { parent, alex } = await makeFamily();
  const t = freshSlot();
  // Validation passed, then another booking for Alex landed before this write.
  await validateBookingRequest(parent, request(priya.id, alex.id, t));
  await existing(parent, casey.id, alex.id, t);
  const before = await prisma.booking.count({ where: { childId: alex.id } });
  const result = await createConfirmedBooking(confirmedInput(parent, priya.id, alex.id, t));
  assert.ok("conflict" in result && result.conflict === CHILD_BUSY);
  assert.match((result as { message: string }).message, /^Alex already has a session then: Tennis with Casey Lee/);
  assert.equal(await prisma.booking.count({ where: { childId: alex.id } }), before);
});

test("the coach's own conflict is still reported as SLOT_TAKEN, and a free time books", async () => {
  const priya = await makeCoach("Priya Shah");
  const { parent, alex, sam } = await makeFamily();
  const t = freshSlot();
  await existing(parent, priya.id, sam.id, t, { sport: "SOCCER" });
  const result = await createConfirmedBooking(confirmedInput(parent, priya.id, alex.id, t));
  assert.deepEqual(result, { conflict: "SLOT_TAKEN" });

  const ok = await createConfirmedBooking(confirmedInput(parent, priya.id, alex.id, new Date(t.getTime() + 2 * 60 * MIN)));
  assert.ok(!("conflict" in ok));
  assert.equal(ok.childId, alex.id);
});
