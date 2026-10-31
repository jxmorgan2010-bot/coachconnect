/**
 * Database tests for referral rewards. They write rows, so they refuse to run unless pointed
 * at a scratch database copy:
 *
 *   DATABASE_URL=file:/path/to/scratch-copy.db REFERRAL_DB_TEST=1 \
 *   npx tsx --test src/lib/referral.db-test.ts
 *
 * The scratch copy needs prisma/sql/2026-10-28-referral-rewards.sql applied first. Stripe is
 * replaced by fake card lookups, so no Stripe key is used.
 * Not matched by `npm test` (*.test.ts), so the normal suite never touches a database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { settleReferral, REFERRAL_BONUS_CENTS, type CardLookups } from "./referral";
import { POINTS_REFERRAL_SIGNUP } from "./points";
import { POST as registerParent } from "../app/api/register/parent/route";

const url = process.env.DATABASE_URL ?? "";
if (process.env.REFERRAL_DB_TEST !== "1" || !url.startsWith("file:") || /(^|[\\/:])dev\.db$/.test(url)) {
  throw new Error("Refusing to run: set REFERRAL_DB_TEST=1 and point DATABASE_URL at a scratch copy (not dev.db).");
}

const DAY = 24 * 60 * 60 * 1000;

// Payment method id -> card fingerprint, and Stripe customer -> fingerprints of saved cards.
const cards = new Map<string, string>();
const savedCards = new Map<string, string[]>();
const lookups: CardLookups = {
  async cardFingerprint({ paymentMethodId, paymentIntentId }) {
    return cards.get(paymentMethodId ?? "") ?? cards.get(paymentIntentId ?? "") ?? null;
  },
  async customerCardFingerprints(customerId) {
    return savedCards.get(customerId) ?? [];
  },
};

async function makeCoach() {
  const user = await prisma.user.create({
    data: {
      name: "Adult Coach",
      email: `coach-${randomUUID()}@example.test`,
      passwordHash: "x",
      role: "COACH",
      coachProfile: { create: { dateOfBirth: new Date(Date.UTC(1999, 0, 1)), hourlyRateCents: 6000 } },
    },
    include: { coachProfile: true },
  });
  return user.coachProfile!;
}

async function makeParent(stripeCustomerId: string | null = null) {
  const user = await prisma.user.create({
    data: {
      name: "Referring Parent",
      email: `parent-${randomUUID()}@example.test`,
      passwordHash: "x",
      role: "PARENT",
      parentProfile: { create: { referralCode: `R${randomUUID().slice(0, 10).toUpperCase()}`, stripeCustomerId } },
    },
    include: { parentProfile: true },
  });
  return user.parentProfile!;
}

/** Signs up through the real registration route, the way the signup form does. */
async function signUpWithCode(referralCode: string) {
  const email = `new-${randomUUID()}@example.test`;
  const res = await registerParent(
    new Request("http://localhost/api/register/parent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Parent", email, password: "password123", referralCode }),
    }),
  );
  assert.equal(res.status, 200, await res.clone().text());
  const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { parentProfile: true } });
  return user.parentProfile!;
}

let slot = 0;
async function completedBooking(
  parentProfileId: string,
  coachProfileId: string,
  pay: { pm?: string; fingerprint?: string; packageId?: string } = {},
) {
  const pi = pay.pm ? `pi_${randomUUID()}` : null;
  if (pay.pm && pay.fingerprint) cards.set(pay.pm, pay.fingerprint);
  return prisma.booking.create({
    data: {
      parentProfileId,
      coachProfileId,
      sport: "SOCCER",
      scheduledAt: new Date(Date.now() - (10 + slot++) * DAY),
      durationMinutes: 60,
      locationText: "Mitchell Park, Palo Alto",
      priceCents: 6000,
      platformFeeCents: 900,
      status: "COMPLETED",
      parentalConsent: true,
      completedAt: new Date(),
      paymentStatus: "CAPTURED",
      capturedAt: new Date(),
      stripePaymentIntentId: pi,
      stripePaymentMethodId: pay.pm ?? null,
      packageId: pay.packageId ?? null,
    },
  });
}

async function credit(id: string) {
  return (await prisma.parentProfile.findUniqueOrThrow({ where: { id } })).creditCents;
}

test("signing up with a code alone gives nobody credit or points", async () => {
  const referrer = await makeParent();
  const referred = await signUpWithCode(referrer.referralCode.toLowerCase());
  assert.equal(referred.referredById, referrer.id);
  assert.equal(referred.referralPending, true);
  assert.equal(referred.creditCents, 0);
  assert.equal(await credit(referrer.id), 0);
  assert.equal(await prisma.pointsTransaction.count({ where: { parentProfileId: referrer.id } }), 0);
});

test("a completed, card-paid session grants both credits and the referral points once", async () => {
  const coach = await makeCoach();
  const referrer = await makeParent();
  const referred = await signUpWithCode(referrer.referralCode);
  const b = await completedBooking(referred.id, coach.id, { pm: `pm_${randomUUID()}`, fingerprint: `fp_${randomUUID()}` });

  assert.equal(await settleReferral(b.id, lookups), "GRANTED");
  assert.equal(await credit(referred.id), REFERRAL_BONUS_CENTS);
  assert.equal(await credit(referrer.id), REFERRAL_BONUS_CENTS);
  const points = await prisma.pointsTransaction.findMany({ where: { parentProfileId: referrer.id } });
  assert.deepEqual(points.map((p) => [p.action, p.points]), [["REFERRAL_SIGNUP", POINTS_REFERRAL_SIGNUP]]);

  // Settling again, or after a second completed session, changes nothing.
  assert.equal(await settleReferral(b.id, lookups), null);
  const second = await completedBooking(referred.id, coach.id, { pm: `pm_${randomUUID()}`, fingerprint: `fp_${randomUUID()}` });
  assert.equal(await settleReferral(second.id, lookups), null);
  assert.equal(await credit(referred.id), REFERRAL_BONUS_CENTS);
  assert.equal(await credit(referrer.id), REFERRAL_BONUS_CENTS);
  assert.equal(await prisma.referralReward.count({ where: { referredParentId: referred.id } }), 1);
});

test("a second account paying with the same card gets nothing, and neither does its referrer", async () => {
  const coach = await makeCoach();
  const card = `fp_${randomUUID()}`;
  const firstReferrer = await makeParent();
  const first = await signUpWithCode(firstReferrer.referralCode);
  assert.equal(await settleReferral((await completedBooking(first.id, coach.id, { pm: `pm_${randomUUID()}`, fingerprint: card })).id, lookups), "GRANTED");

  const secondReferrer = await makeParent();
  const second = await signUpWithCode(secondReferrer.referralCode);
  const b = await completedBooking(second.id, coach.id, { pm: `pm_${randomUUID()}`, fingerprint: card });
  assert.equal(await settleReferral(b.id, lookups), "DUPLICATE_CARD");
  assert.equal(await credit(second.id), 0);
  assert.equal(await credit(secondReferrer.id), 0);
  const row = await prisma.referralReward.findUniqueOrThrow({ where: { referredParentId: second.id } });
  assert.equal(row.creditCents, 0);
  assert.equal(row.cardFingerprint, null);
  // Closed for good: a later session on a different card doesn't reopen it.
  const later = await completedBooking(second.id, coach.id, { pm: `pm_${randomUUID()}`, fingerprint: `fp_${randomUUID()}` });
  assert.equal(await settleReferral(later.id, lookups), null);
  assert.equal(await credit(second.id), 0);
});

test("a parent can't refer themselves with a second account on their own card", async () => {
  const coach = await makeCoach();
  const customer = `cus_${randomUUID()}`;
  const ownCard = `fp_${randomUUID()}`;
  savedCards.set(customer, [`fp_${randomUUID()}`, ownCard]);
  const referrer = await makeParent(customer);
  const alt = await signUpWithCode(referrer.referralCode);
  const b = await completedBooking(alt.id, coach.id, { pm: `pm_${randomUUID()}`, fingerprint: ownCard });
  assert.equal(await settleReferral(b.id, lookups), "SELF_REFERRAL");
  assert.equal(await credit(alt.id), 0);
  assert.equal(await credit(referrer.id), 0);
  assert.equal(await prisma.pointsTransaction.count({ where: { parentProfileId: referrer.id } }), 0);
});

test("a session with no card charge leaves the referral pending; a package bought by card counts", async () => {
  const coach = await makeCoach();
  const referrer = await makeParent();
  const referred = await signUpWithCode(referrer.referralCode);

  const covered = await completedBooking(referred.id, coach.id);
  assert.equal(await settleReferral(covered.id, lookups), null);
  assert.equal((await prisma.parentProfile.findUniqueOrThrow({ where: { id: referred.id } })).referralPending, true);

  const packagePi = `pi_${randomUUID()}`;
  cards.set(packagePi, `fp_${randomUUID()}`);
  const pkg = await prisma.sessionPackage.create({
    data: {
      parentProfileId: referred.id,
      coachProfileId: coach.id,
      sport: "SOCCER",
      durationMinutes: 60,
      totalSessions: 5,
      sessionsUsed: 1,
      pricePerSessionCents: 6000,
      discountPercent: 10,
      totalChargedCents: 27000,
      stripePaymentIntentId: packagePi,
    },
  });
  const fromPackage = await completedBooking(referred.id, coach.id, { packageId: pkg.id });
  assert.equal(await settleReferral(fromPackage.id, lookups), "GRANTED");
  assert.equal(await credit(referred.id), REFERRAL_BONUS_CENTS);
});

test("a Stripe lookup failure leaves the referral pending for the next session", async () => {
  const coach = await makeCoach();
  const referrer = await makeParent();
  const referred = await signUpWithCode(referrer.referralCode);
  const b = await completedBooking(referred.id, coach.id, { pm: `pm_${randomUUID()}` }); // no fingerprint known
  await assert.rejects(settleReferral(b.id, lookups));
  assert.equal((await prisma.parentProfile.findUniqueOrThrow({ where: { id: referred.id } })).referralPending, true);
  assert.equal(await credit(referrer.id), 0);
});

test("parents credited at signup under the old rules are never credited again", async () => {
  const coach = await makeCoach();
  const referrer = await makeParent();
  // An old-rules referral: credited at signup, so referralPending reads as its default, false.
  const old = await makeParent();
  await prisma.parentProfile.update({ where: { id: old.id }, data: { referredById: referrer.id, creditCents: REFERRAL_BONUS_CENTS } });
  const b = await completedBooking(old.id, coach.id, { pm: `pm_${randomUUID()}`, fingerprint: `fp_${randomUUID()}` });
  assert.equal(await settleReferral(b.id, lookups), null);
  assert.equal(await credit(old.id), REFERRAL_BONUS_CENTS);
  assert.equal(await credit(referrer.id), 0);
});

test("a bad referral code is still rejected at signup", async () => {
  const res = await registerParent(
    new Request("http://localhost/api/register/parent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Parent", email: `x-${randomUUID()}@example.test`, password: "password123", referralCode: "NOPE0000" }),
    }),
  );
  assert.equal(res.status, 400);
});
