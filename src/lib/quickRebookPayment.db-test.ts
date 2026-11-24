/**
 * Database tests for how quick rebook pays: a package session first, then a saved card.
 * They write rows, so they refuse to run unless pointed at a scratch database copy:
 *
 *   DATABASE_URL=file:/path/to/scratch-copy.db QUICK_REBOOK_DB_TEST=1 \
 *   npx tsx --test src/lib/quickRebookPayment.db-test.ts
 *
 * No Stripe call is made: card lookups are faked.
 * Not matched by `npm test` (*.test.ts), so the normal suite never touches a database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";

const url = process.env.DATABASE_URL ?? "";
if (process.env.QUICK_REBOOK_DB_TEST !== "1" || !url.startsWith("file:") || /(^|[\\/:])dev\.db$/.test(url)) {
  throw new Error("Refusing to run: set QUICK_REBOOK_DB_TEST=1 and point DATABASE_URL at a scratch copy (not dev.db).");
}

import { prisma } from "./prisma";
import { findRebookCard, findRebookPackage, type SavedCardInfo } from "./quickRebookPayment";
import { validatePackageBookingRequest, createPackageBooking, isBookingConflict } from "./bookingValidation";
import type { Sport } from "@/generated/prisma/client";

const DAY = 24 * 60 * 60 * 1000;
const LOCATION = "Mission Playground field";

let dayOffset = 5;
function freshSlot(): Date {
  const d = new Date(Date.now() + dayOffset++ * DAY);
  d.setUTCHours(18, 0, 0, 0);
  return d;
}

async function makeCoach(sport: Sport = "SOCCER") {
  const user = await prisma.user.create({
    data: {
      name: "Priya Shah",
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

async function makeFamily(stripeCustomerId: string | null = `cus_${randomUUID()}`) {
  const user = await prisma.user.create({
    data: {
      name: "Pat Parent",
      email: `parent-${randomUUID()}@example.test`,
      passwordHash: "x",
      role: "PARENT",
      parentProfile: { create: { referralCode: `C${randomUUID().slice(0, 10)}`, stripeCustomerId } },
    },
    include: { parentProfile: true },
  });
  const parent = user.parentProfile!;
  const alex = await prisma.child.create({
    data: { parentProfileId: parent.id, firstName: "Alex", gradeOrAge: "age 11", sportLevels: { create: [{ sport: "SOCCER", level: "BEGINNER" }] } },
  });
  return { parent, alex };
}

function makePackage(parentProfileId: string, coachProfileId: string, over: { sport?: Sport; durationMinutes?: number; sessionsUsed?: number; sessionsCashRefunded?: number; status?: "ACTIVE" | "DEPLETED"; createdAt?: Date } = {}) {
  return prisma.sessionPackage.create({
    data: {
      parentProfileId,
      coachProfileId,
      sport: over.sport ?? "SOCCER",
      durationMinutes: over.durationMinutes ?? 60,
      totalSessions: 5,
      sessionsUsed: over.sessionsUsed ?? 0,
      sessionsCashRefunded: over.sessionsCashRefunded ?? 0,
      status: over.status ?? "ACTIVE",
      pricePerSessionCents: 4000,
      discountPercent: 10,
      totalChargedCents: 18000,
      ...(over.createdAt ? { createdAt: over.createdAt } : {}),
    },
  });
}

async function booking(parentProfileId: string, coachProfileId: string, childId: string, over: { stripePaymentMethodId?: string | null; createdAt?: Date; packageId?: string } = {}) {
  return prisma.booking.create({
    data: {
      parentProfileId,
      coachProfileId,
      childId,
      sport: "SOCCER",
      scheduledAt: new Date(Date.now() - 3 * DAY),
      durationMinutes: 60,
      locationText: LOCATION,
      priceCents: 4000,
      platformFeeCents: 600,
      status: "COMPLETED",
      stripePaymentMethodId: over.stripePaymentMethodId ?? null,
      packageId: over.packageId ?? null,
      ...(over.createdAt ? { createdAt: over.createdAt } : {}),
    },
  });
}

/** A fake Stripe lookup: each card id maps to the customer it's attached to (missing = not found). */
function fakeStripe(cards: Record<string, { customerId: string | null; brand?: string; last4?: string }>) {
  const calls: string[] = [];
  const retrieveCard = async (id: string): Promise<SavedCardInfo | null> => {
    calls.push(id);
    const c = cards[id];
    if (!c) throw Object.assign(new Error("No such PaymentMethod"), { code: "resource_missing" });
    return { customerId: c.customerId, brand: c.brand ?? "visa", last4: c.last4 ?? "4242" };
  };
  return { retrieveCard, calls };
}

test("package: the oldest matching package with sessions left is used", async () => {
  const coach = await makeCoach();
  const { parent } = await makeFamily();
  await makePackage(parent.id, coach.id, { sessionsUsed: 5, status: "DEPLETED", createdAt: new Date(Date.now() - 30 * DAY) });
  await makePackage(parent.id, coach.id, { sessionsUsed: 3, sessionsCashRefunded: 2, createdAt: new Date(Date.now() - 20 * DAY) }); // none left
  const older = await makePackage(parent.id, coach.id, { sessionsUsed: 4, createdAt: new Date(Date.now() - 10 * DAY) });
  await makePackage(parent.id, coach.id, { createdAt: new Date(Date.now() - 1 * DAY) });
  const found = await findRebookPackage(parent.id, coach.id, "SOCCER", 60);
  assert.equal(found?.id, older.id);
});

test("package: a different sport, length or coach doesn't count", async () => {
  const [coach, otherCoach] = [await makeCoach(), await makeCoach()];
  const { parent } = await makeFamily();
  await makePackage(parent.id, coach.id, { durationMinutes: 45 });
  await makePackage(parent.id, coach.id, { sport: "TENNIS" });
  await makePackage(parent.id, otherCoach.id);
  assert.equal(await findRebookPackage(parent.id, coach.id, "SOCCER", 60), null);
  assert.ok(await findRebookPackage(parent.id, coach.id, "SOCCER", 45));
});

test("card: the prior booking's own card is used without confirmation", async () => {
  const coach = await makeCoach();
  const { parent, alex } = await makeFamily();
  await booking(parent.id, coach.id, alex.id, { stripePaymentMethodId: "pm_other" });
  const prior = await booking(parent.id, coach.id, alex.id, { stripePaymentMethodId: "pm_prior" });
  const { retrieveCard, calls } = fakeStripe({ pm_prior: { customerId: parent.stripeCustomerId }, pm_other: { customerId: parent.stripeCustomerId } });
  const card = await findRebookCard({ parentProfileId: parent.id, stripeCustomerId: parent.stripeCustomerId, priorBooking: prior, retrieveCard });
  assert.deepEqual(card, { paymentMethodId: "pm_prior", label: "Visa ending 4242", fromOtherBooking: false });
  assert.deepEqual(calls, ["pm_prior"]);
});

test("card: after a package session, the newest card from another booking is offered for confirmation", async () => {
  const coach = await makeCoach();
  const { parent, alex } = await makeFamily();
  const pkg = await makePackage(parent.id, coach.id, { sessionsUsed: 5, status: "DEPLETED" });
  await booking(parent.id, coach.id, alex.id, { stripePaymentMethodId: "pm_old", createdAt: new Date(Date.now() - 20 * DAY) });
  await booking(parent.id, coach.id, alex.id, { stripePaymentMethodId: "pm_new", createdAt: new Date(Date.now() - 10 * DAY) });
  const prior = await booking(parent.id, coach.id, alex.id, { packageId: pkg.id });
  const { retrieveCard } = fakeStripe({
    pm_old: { customerId: parent.stripeCustomerId },
    pm_new: { customerId: parent.stripeCustomerId, brand: "mastercard", last4: "4444" },
  });
  const card = await findRebookCard({ parentProfileId: parent.id, stripeCustomerId: parent.stripeCustomerId, priorBooking: prior, retrieveCard });
  assert.deepEqual(card, { paymentMethodId: "pm_new", label: "Mastercard ending 4444", fromOtherBooking: true });
});

test("card: removed cards, or cards on someone else's customer, are skipped", async () => {
  const coach = await makeCoach();
  const { parent, alex } = await makeFamily();
  await booking(parent.id, coach.id, alex.id, { stripePaymentMethodId: "pm_ok", createdAt: new Date(Date.now() - 30 * DAY) });
  await booking(parent.id, coach.id, alex.id, { stripePaymentMethodId: "pm_gone", createdAt: new Date(Date.now() - 20 * DAY) });
  await booking(parent.id, coach.id, alex.id, { stripePaymentMethodId: "pm_detached", createdAt: new Date(Date.now() - 10 * DAY) });
  const prior = await booking(parent.id, coach.id, alex.id, { stripePaymentMethodId: "pm_prior_detached" });
  const { retrieveCard } = fakeStripe({
    pm_prior_detached: { customerId: null },
    pm_detached: { customerId: "cus_someone_else" },
    pm_ok: { customerId: parent.stripeCustomerId },
  });
  const card = await findRebookCard({ parentProfileId: parent.id, stripeCustomerId: parent.stripeCustomerId, priorBooking: prior, retrieveCard });
  assert.deepEqual(card, { paymentMethodId: "pm_ok", label: "Visa ending 4242", fromOtherBooking: true });
});

test("card: none at all, or no Stripe customer, gives null", async () => {
  const coach = await makeCoach();
  const { parent, alex } = await makeFamily();
  const prior = await booking(parent.id, coach.id, alex.id);
  const { retrieveCard, calls } = fakeStripe({});
  assert.equal(await findRebookCard({ parentProfileId: parent.id, stripeCustomerId: parent.stripeCustomerId, priorBooking: prior, retrieveCard }), null);

  const noCustomer = await makeFamily(null);
  const prior2 = await booking(noCustomer.parent.id, coach.id, noCustomer.alex.id, { stripePaymentMethodId: "pm_x" });
  assert.equal(await findRebookCard({ parentProfileId: noCustomer.parent.id, stripeCustomerId: null, priorBooking: prior2, retrieveCard }), null);
  assert.deepEqual(calls, []);
});

test("another family's cards are never considered", async () => {
  const coach = await makeCoach();
  const me = await makeFamily();
  const them = await makeFamily();
  await booking(them.parent.id, coach.id, them.alex.id, { stripePaymentMethodId: "pm_theirs" });
  const prior = await booking(me.parent.id, coach.id, me.alex.id);
  const { retrieveCard, calls } = fakeStripe({ pm_theirs: { customerId: me.parent.stripeCustomerId } });
  assert.equal(await findRebookCard({ parentProfileId: me.parent.id, stripeCustomerId: me.parent.stripeCustomerId, priorBooking: prior, retrieveCard }), null);
  assert.deepEqual(calls, []);
});

test("package booking: spends one session, marks it a quick rebook, and depletes the package at the last one", async () => {
  const coach = await makeCoach();
  const { parent, alex } = await makeFamily();
  const pkg = await makePackage(parent.id, coach.id, { sessionsUsed: 4 });
  const scheduledAt = freshSlot();
  const validated = await validatePackageBookingRequest(parent, { packageId: pkg.id, childId: alex.id, scheduledAt, locationText: LOCATION });
  const result = await createPackageBooking({ parentProfileId: parent.id, childId: alex.id, scheduledAt, locationText: LOCATION, validated, bookedViaQuickRebook: true });
  assert.ok(!isBookingConflict(result));
  assert.equal(result.packageId, pkg.id);
  assert.equal(result.bookedViaQuickRebook, true);
  assert.equal(result.paymentStatus, "CAPTURED");
  assert.equal(result.stripePaymentMethodId, null);
  assert.equal(result.packageSessionsLeft, 0);
  const after = await prisma.sessionPackage.findUniqueOrThrow({ where: { id: pkg.id } });
  assert.equal(after.sessionsUsed, 5);
  assert.equal(after.status, "DEPLETED");
});

test("package booking: if the last session was spent after validation, nothing is booked", async () => {
  const coach = await makeCoach();
  const { parent, alex } = await makeFamily();
  const pkg = await makePackage(parent.id, coach.id, { sessionsUsed: 4 });
  const scheduledAt = freshSlot();
  const validated = await validatePackageBookingRequest(parent, { packageId: pkg.id, childId: alex.id, scheduledAt, locationText: LOCATION });
  await prisma.sessionPackage.update({ where: { id: pkg.id }, data: { sessionsUsed: 5, status: "DEPLETED" } });
  const before = await prisma.booking.count({ where: { packageId: pkg.id } });
  const result = await createPackageBooking({ parentProfileId: parent.id, childId: alex.id, scheduledAt, locationText: LOCATION, validated });
  assert.deepEqual(result, { conflict: "PACKAGE_EMPTY" });
  assert.equal(await prisma.booking.count({ where: { packageId: pkg.id } }), before);
  assert.equal((await prisma.sessionPackage.findUniqueOrThrow({ where: { id: pkg.id } })).sessionsUsed, 5);
});
