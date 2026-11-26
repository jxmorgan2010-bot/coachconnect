/**
 * Database tests for delivering a paid package (browser and Stripe webhook share deliverPackage).
 * They write rows, so they refuse to run unless pointed at a scratch database copy:
 *
 *   DATABASE_URL=file:/path/to/scratch-copy.db PACKAGE_PURCHASE_DB_TEST=1 \
 *   npx tsx --test src/lib/packagePurchase.db-test.ts
 *
 * No Stripe call is made: payments are plain objects.
 * Not matched by `npm test` (*.test.ts), so the normal suite never touches a database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";

const url = process.env.DATABASE_URL ?? "";
if (process.env.PACKAGE_PURCHASE_DB_TEST !== "1" || !url.startsWith("file:") || /(^|[\\/:])dev\.db$/.test(url)) {
  throw new Error("Refusing to run: set PACKAGE_PURCHASE_DB_TEST=1 and point DATABASE_URL at a scratch copy (not dev.db).");
}

import { prisma } from "./prisma";
import { deliverPackage } from "./packagePurchase";
import { packageMetadata, type PackageIntent } from "./packageIntent";
import { calculateBundlePricing } from "./bundles";

const RATE = 4000;

async function people() {
  const coach = await prisma.user.create({
    data: {
      name: "Priya Shah",
      email: `coach-${randomUUID()}@example.test`,
      passwordHash: "x",
      role: "COACH",
      coachProfile: { create: { hourlyRateCents: RATE, sports: { create: { sport: "SOCCER" } } } },
    },
    include: { coachProfile: true },
  });
  const parent = await prisma.user.create({
    data: {
      name: "Pat Parent",
      email: `parent-${randomUUID()}@example.test`,
      passwordHash: "x",
      role: "PARENT",
      parentProfile: { create: { referralCode: `P${randomUUID().slice(0, 10)}` } },
    },
    include: { parentProfile: true },
  });
  return { coach: coach.coachProfile!, parent: parent.parentProfile! };
}

function paid(parentProfileId: string, coachProfileId: string, over: Partial<PackageIntent> = {}): PackageIntent {
  const pricing = calculateBundlePricing(RATE, 60);
  return {
    id: `pi_${randomUUID()}`,
    status: "succeeded",
    amount: pricing.totalChargedCents,
    metadata: packageMetadata({ parentProfileId, coachProfileId, sport: "SOCCER", durationMinutes: 60, pricing }),
    latest_charge: { amount_refunded: 0 },
    ...over,
  };
}
const count = (intentId: string) => prisma.sessionPackage.count({ where: { stripePaymentIntentId: intentId } });

test("a paid package is created with what was bought", async () => {
  const { coach, parent } = await people();
  const intent = paid(parent.id, coach.id);
  const result = await deliverPackage(intent);
  assert.equal(result.status, "CREATED");
  const pkg = await prisma.sessionPackage.findUniqueOrThrow({ where: { stripePaymentIntentId: intent.id } });
  assert.deepEqual(
    [pkg.parentProfileId, pkg.coachProfileId, pkg.sport, pkg.durationMinutes, pkg.totalSessions, pkg.sessionsUsed, pkg.pricePerSessionCents, pkg.discountPercent, pkg.totalChargedCents, pkg.status],
    [parent.id, coach.id, "SOCCER", 60, 5, 0, 4000, 10, 18000, "ACTIVE"],
  );
});

test("delivered twice, or by browser and webhook at the same moment: one package", async () => {
  const { coach, parent } = await people();
  const intent = paid(parent.id, coach.id);
  const first = await deliverPackage(intent);
  const second = await deliverPackage(intent);
  assert.equal(second.status, "EXISTING");
  assert.equal("packageId" in second && second.packageId, "packageId" in first && first.packageId);

  const racing = paid(parent.id, coach.id);
  const results = await Promise.all(Array.from({ length: 5 }, () => deliverPackage(racing)));
  assert.equal(results.filter((r) => r.status === "CREATED").length, 1);
  assert.equal(results.filter((r) => r.status === "EXISTING").length, 4);
  assert.equal(await count(racing.id), 1);
});

test("the coach changing their rate after payment doesn't matter: the package is what was paid for", async () => {
  const { coach, parent } = await people();
  const intent = paid(parent.id, coach.id);
  await prisma.coachProfile.update({ where: { id: coach.id }, data: { hourlyRateCents: 9000 } });
  assert.equal((await deliverPackage(intent)).status, "CREATED");
  const pkg = await prisma.sessionPackage.findUniqueOrThrow({ where: { stripePaymentIntentId: intent.id } });
  assert.deepEqual([pkg.pricePerSessionCents, pkg.totalChargedCents], [4000, 18000]);
});

test("unpaid, refunded or someone else's kind of payment: nothing is created", async () => {
  const { coach, parent } = await people();
  const cases: [string, PackageIntent][] = [
    ["NOT_PAID", paid(parent.id, coach.id, { status: "requires_action", latest_charge: null })],
    ["NOT_PAID", paid(parent.id, coach.id, { status: "requires_payment_method" })],
    ["REFUNDED", paid(parent.id, coach.id, { latest_charge: { amount_refunded: 18000 } })],
    ["NOT_A_PACKAGE", paid(parent.id, coach.id, { metadata: { parentProfileId: parent.id, coachProfileId: coach.id } })],
    ["NOT_A_PACKAGE", paid(parent.id, coach.id, { metadata: null })],
  ];
  for (const [status, intent] of cases) {
    assert.equal((await deliverPackage(intent)).status, status);
    assert.equal(await count(intent.id), 0);
  }
});

test("a partial refund still delivers", async () => {
  const { coach, parent } = await people();
  assert.equal((await deliverPackage(paid(parent.id, coach.id, { latest_charge: { amount_refunded: 500 } }))).status, "CREATED");
});

test("paid but the coach's or parent's account is gone: reported, nothing created", async () => {
  const { coach, parent } = await people();
  for (const intent of [paid(parent.id, "gone"), paid("gone", coach.id)]) {
    assert.equal((await deliverPackage(intent)).status, "UNDELIVERABLE");
    assert.equal(await count(intent.id), 0);
  }
});

test("a payment from before the price was recorded: delivered only while the rate still matches", async () => {
  const { coach, parent } = await people();
  const legacy = { parentProfileId: parent.id, coachProfileId: coach.id, sport: "SOCCER", durationMinutes: "60" };
  assert.equal((await deliverPackage(paid(parent.id, coach.id, { metadata: legacy }))).status, "CREATED");
  await prisma.coachProfile.update({ where: { id: coach.id }, data: { hourlyRateCents: 9000 } });
  const late = paid(parent.id, coach.id, { metadata: legacy });
  assert.equal((await deliverPackage(late)).status, "UNDELIVERABLE");
  assert.equal(await count(late.id), 0);
});

test("a payment loaded without its charge is an error, not a free package", async () => {
  const { coach, parent } = await people();
  const intent = paid(parent.id, coach.id, { latest_charge: "ch_1" });
  await assert.rejects(deliverPackage(intent));
  assert.equal(await count(intent.id), 0);
});
