/**
 * Database tests for the auto-release job's per-booking claim. They write rows, so they refuse to
 * run unless pointed at a scratch database copy:
 *
 *   DATABASE_URL=file:/path/to/scratch-copy.db AUTO_RELEASE_DB_TEST=1 \
 *   npx tsx --test src/lib/autoRelease.db-test.ts
 *
 * The scratch copy needs prisma/sql/2026-11-02-scheduler.sql applied first. Stripe is replaced by
 * a fake that, like the real one, answers 409 to a second request while the first with the same
 * idempotency key is still in flight. No Stripe key is used and no email is sent.
 * Not matched by `npm test` (*.test.ts), so the normal suite never touches a database.
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";

const url = process.env.DATABASE_URL ?? "";
if (process.env.AUTO_RELEASE_DB_TEST !== "1" || !url.startsWith("file:") || /(^|[\\/:])dev\.db$/.test(url)) {
  throw new Error("Refusing to run: set AUTO_RELEASE_DB_TEST=1 and point DATABASE_URL at a scratch copy (not dev.db).");
}
process.env.STRIPE_SECRET_KEY = "sk_test_not_a_real_key";
delete process.env.RESEND_API_KEY;

import { prisma } from "./prisma";
import { getStripe } from "./stripe";
import { JobLog } from "./jobs/runLog";
import { runAutoReleaseJob } from "./autoRelease";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const PRICE_CENTS = 6000;

type Call = { method: string; id: string };

/** What every test's fake Stripe saw. */
let calls: Call[] = [];
let inFlight = new Set<string>();
let holds = new Map<string, string>();
let failNext: Error | null = null;

function stripeError(type: string, code: string) {
  return Object.assign(new Error(code), { type, code });
}

async function fakeWrite(method: string, id: string, key: string, result: () => unknown) {
  calls.push({ method, id });
  if (failNext) {
    const err = failNext;
    failNext = null;
    throw err;
  }
  if (inFlight.has(key)) throw stripeError("StripeInvalidRequestError", "idempotency_key_in_use");
  inFlight.add(key);
  await new Promise((resolve) => setTimeout(resolve, 40));
  inFlight.delete(key);
  return result();
}

const stripe = getStripe();
Object.assign(stripe.paymentIntents, {
  async retrieve(id: string) {
    calls.push({ method: "retrieve", id });
    return { id, status: holds.get(id) ?? "requires_capture", metadata: {} };
  },
  async capture(id: string, _params: unknown, options: { idempotencyKey: string }) {
    return fakeWrite("capture", id, options.idempotencyKey, () => {
      holds.set(id, "succeeded");
      return { id, status: "succeeded" };
    });
  },
  async create(params: { metadata: { bookingId: string } }, options: { idempotencyKey: string }) {
    const id = `pi_charge_${params.metadata.bookingId}`;
    return fakeWrite("create", id, options.idempotencyKey, () => ({ id, status: "succeeded" }));
  },
});

function stripeWrites() {
  return calls.filter((c) => c.method !== "retrieve");
}

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

async function makeParent() {
  const user = await prisma.user.create({
    data: {
      name: "Test Parent",
      email: `parent-${randomUUID()}@example.test`,
      passwordHash: "x",
      role: "PARENT",
      parentProfile: { create: { referralCode: `R${randomUUID().slice(0, 10).toUpperCase()}`, stripeCustomerId: `cus_${randomUUID()}` } },
    },
    include: { parentProfile: true },
  });
  return user.parentProfile!;
}

/** A confirmed session that ended well over 48 hours ago, due for auto-release. */
async function dueBooking(pay: { hold: boolean; holdClaimedAt?: Date }) {
  const [parent, coach] = await Promise.all([makeParent(), makeCoach()]);
  const holdId = pay.hold ? `pi_${randomUUID()}` : null;
  return prisma.booking.create({
    data: {
      parentProfileId: parent.id,
      coachProfileId: coach.id,
      sport: "SOCCER",
      scheduledAt: new Date(Date.now() - 4 * DAY),
      durationMinutes: 60,
      locationText: "Mitchell Park, Palo Alto",
      priceCents: PRICE_CENTS,
      platformFeeCents: 900,
      status: "CONFIRMED",
      stripePaymentIntentId: holdId,
      stripePaymentMethodId: `pm_${randomUUID()}`,
      holdClaimedAt: pay.holdClaimedAt ?? null,
    },
  });
}

async function run(now = new Date()) {
  const log = new JobLog();
  await runAutoReleaseJob(log, now);
  return log;
}

function completedBy(logs: JobLog[]) {
  return logs.reduce((n, log) => n + (log.counts["auto-completed and charged"] ?? 0), 0);
}

beforeEach(async () => {
  calls = [];
  inFlight = new Set();
  holds = new Map();
  failNext = null;
  // Each test sees only its own bookings.
  await prisma.booking.updateMany({ where: { status: "CONFIRMED" }, data: { status: "CANCELLED" } });
});

test("two runs at once on a live hold: one capture, one completion, no flag", async () => {
  const b = await dueBooking({ hold: true });
  const logs = await Promise.all([run(), run()]);

  assert.deepEqual(stripeWrites(), [{ method: "capture", id: b.stripePaymentIntentId }]);
  assert.equal(calls.filter((c) => c.method === "retrieve").length, 1, "the losing run must not reach Stripe at all");
  assert.equal(completedBy(logs), 1, "only one run sends the emails");

  const after = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
  assert.equal(after.status, "COMPLETED");
  assert.equal(after.paymentStatus, "CAPTURED");
  assert.equal(after.autoCompleted, true);
  assert.equal(after.adminFlag, null);
  assert.equal(after.holdClaimedAt, null);
});

test("two runs at once with no hold: the saved card is charged once", async () => {
  const b = await dueBooking({ hold: false });
  const logs = await Promise.all([run(), run()]);

  assert.deepEqual(stripeWrites(), [{ method: "create", id: `pi_charge_${b.id}` }]);
  assert.equal(completedBy(logs), 1);
  const after = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
  assert.equal(after.status, "COMPLETED");
  assert.equal(after.stripePaymentIntentId, `pi_charge_${b.id}`);
  assert.equal(after.adminFlag, null);
});

test("five runs at once over several bookings: each booking reaches Stripe once", async () => {
  const bookings = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => dueBooking({ hold: i % 2 === 0 })));
  const logs = await Promise.all([run(), run(), run(), run(), run()]);

  assert.equal(stripeWrites().length, bookings.length);
  assert.equal(new Set(stripeWrites().map((c) => c.id)).size, bookings.length);
  assert.equal(completedBy(logs), bookings.length);
  const after = await prisma.booking.findMany({ where: { id: { in: bookings.map((b) => b.id) } } });
  assert.ok(after.every((b) => b.status === "COMPLETED" && b.adminFlag === null));
});

test("a booking another run is working on is left alone", async () => {
  const b = await dueBooking({ hold: true, holdClaimedAt: new Date(Date.now() - 2 * MINUTE) });
  const log = await run();

  assert.deepEqual(calls, []);
  assert.equal(completedBy([log]), 0);
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status, "CONFIRMED");
});

test("a claim left by a run that died is picked up once it expires", async () => {
  const b = await dueBooking({ hold: true, holdClaimedAt: new Date(Date.now() - 11 * MINUTE) });
  const log = await run();

  assert.deepEqual(stripeWrites(), [{ method: "capture", id: b.stripePaymentIntentId }]);
  assert.equal(completedBy([log]), 1);
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status, "COMPLETED");
});

test("a run that died after capturing finishes the booking without capturing again", async () => {
  const b = await dueBooking({ hold: true, holdClaimedAt: new Date(Date.now() - 11 * MINUTE) });
  holds.set(b.stripePaymentIntentId!, "succeeded");
  const log = await run();

  assert.deepEqual(stripeWrites(), []);
  assert.equal(completedBy([log]), 1);
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status, "COMPLETED");
});

test("a temporary Stripe problem frees the claim, so the next run retries", async () => {
  const b = await dueBooking({ hold: true });
  failNext = stripeError("StripeConnectionError", "connection");
  await run();

  const between = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
  assert.equal(between.status, "CONFIRMED");
  assert.equal(between.adminFlag, null);
  assert.equal(between.holdClaimedAt, null);

  const log = await run();
  assert.equal(completedBy([log]), 1);
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status, "COMPLETED");
});

test("a declined card is flagged once, and clearing the flag lets the next run retry", async () => {
  const b = await dueBooking({ hold: true });
  failNext = stripeError("StripeCardError", "card_declined");
  await run();

  const flagged = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
  assert.equal(flagged.adminFlag, "CHARGE_FAILED");
  assert.equal(flagged.status, "CONFIRMED");
  assert.equal(flagged.holdClaimedAt, null);

  calls = [];
  await run();
  assert.deepEqual(calls, [], "a flagged booking isn't retried");

  await prisma.booking.update({ where: { id: b.id }, data: { adminFlag: null, adminFlaggedAt: null } });
  const log = await run();
  assert.equal(completedBy([log]), 1);
});
