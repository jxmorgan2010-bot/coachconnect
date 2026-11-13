/**
 * Database tests for recording failed sends and admin retries. They write rows, so they refuse to
 * run unless pointed at a scratch database copy:
 *
 *   DATABASE_URL=file:/path/to/scratch-copy.db EMAIL_FAILURE_DB_TEST=1 \
 *   npx tsx --test src/lib/emailRetry.db-test.ts
 *
 * The scratch copy needs prisma/sql/2026-11-13-email-send-failures.sql applied first.
 * Resend is never called: fetch is replaced with a fake, and the key is a dummy set here.
 * Not matched by `npm test` (*.test.ts), so the normal suite never touches a database.
 */
import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = process.env.DATABASE_URL ?? "";
if (process.env.EMAIL_FAILURE_DB_TEST !== "1" || !url.startsWith("file:") || /(^|[\\/:])dev\.db$/.test(url)) {
  throw new Error("Refusing to run: set EMAIL_FAILURE_DB_TEST=1 and point DATABASE_URL at a scratch copy (not dev.db).");
}
if (process.env.RESEND_API_KEY) throw new Error("Refusing to run with RESEND_API_KEY set: these tests use a dummy key and a fake fetch.");

import { prisma } from "./prisma";
import { sendEmail } from "./email";
import { passwordResetEmail } from "./emails";
import { bookingConfirmedParentFor, loadBooking } from "./notify";
import { retryEmailFailure, RETRY_CLAIM_MS } from "./emailRetry";
import { markEmailFailureReviewed } from "./emailFailureStore";
import { hashResetToken } from "./passwordReset";
import { holdFixDeadline } from "./holdTiming";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

type Sent = { to: string[]; subject: string; text: string };
let sent: Sent[];
let resend: "ok" | "reject" | "down";
const originalFetch = globalThis.fetch;
const quiet = { log: console.log, error: console.error, warn: console.warn };

beforeEach(async () => {
  await prisma.emailSendFailure.deleteMany({});
  process.env.VERCEL_ENV = "production";
  process.env.RESEND_API_KEY = "re_test_dummy";
  process.env.EMAIL_FROM = "Assist Coaching <noreply@example.test>";
  sent = [];
  resend = "ok";
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    if (resend === "down") throw new TypeError("fetch failed");
    if (resend === "reject") return new Response(JSON.stringify({ name: "internal_server_error" }), { status: 500 });
    sent.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ id: `email_${sent.length}` }), { status: 200 });
  }) as typeof fetch;
  console.log = console.error = console.warn = () => {};
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.VERCEL_ENV;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  Object.assign(console, quiet);
});

async function makeAdmin() {
  return prisma.user.create({ data: { name: "Admin", email: `admin-${randomUUID()}@example.test`, passwordHash: "x", role: "ADMIN" } });
}

async function makeBooking(over: Partial<{ scheduledAt: Date; status: "CONFIRMED" | "CANCELLED" | "COMPLETED"; holdFailedAt: Date | null; stripePaymentIntentId: string | null }> = {}) {
  const coach = await prisma.user.create({
    data: {
      name: "Priya Coach",
      email: `coach-${randomUUID()}@example.test`,
      passwordHash: "x",
      role: "COACH",
      coachProfile: { create: { dateOfBirth: new Date(Date.UTC(1999, 0, 1)), hourlyRateCents: 6000 } },
    },
    include: { coachProfile: true },
  });
  const parent = await prisma.user.create({
    data: {
      name: "Pat Parent",
      email: `parent-${randomUUID()}@example.test`,
      passwordHash: "x",
      role: "PARENT",
      parentProfile: { create: { referralCode: `R${randomUUID().slice(0, 10).toUpperCase()}` } },
    },
    include: { parentProfile: true },
  });
  return prisma.booking.create({
    data: {
      parentProfileId: parent.parentProfile!.id,
      coachProfileId: coach.coachProfile!.id,
      sport: "SOCCER",
      scheduledAt: over.scheduledAt ?? new Date(Date.now() + 3 * DAY),
      durationMinutes: 60,
      locationText: "Mitchell Park, Palo Alto",
      priceCents: 6000,
      platformFeeCents: 900,
      status: over.status ?? "CONFIRMED",
      holdFailedAt: over.holdFailedAt ?? null,
      stripePaymentIntentId: over.stripePaymentIntentId === undefined ? `pi_${randomUUID()}` : over.stripePaymentIntentId,
    },
    include: { parentProfile: { include: { user: true } } },
  });
}

async function onlyFailure() {
  const rows = await prisma.emailSendFailure.findMany();
  assert.equal(rows.length, 1);
  return rows[0];
}

// ---------------------------------------------------------------- recording

test("a Resend rejection is recorded with its retry recipe, and no body or link", async () => {
  const b = await makeBooking();
  resend = "reject";
  const result = await sendEmail(bookingConfirmedParentFor((await loadBooking(b.id))!));
  assert.equal(result.status, "failed");
  const row = await onlyFailure();
  assert.equal(row.toEmail, b.parentProfile.user.email);
  assert.equal(row.reason, "Resend rejected it (500 internal_server_error)");
  assert.equal(row.retryKind, "BOOKING_CONFIRMED_PARENT");
  assert.equal(row.retryRef, b.id);
  assert.equal(row.resolvedAt, null);
  assert.ok(!JSON.stringify(row).includes("http"), "no links stored");
});

test("Resend unreachable, and a missing key in production, are recorded; a password reset's link is not", async () => {
  resend = "down";
  await sendEmail(passwordResetEmail({ to: "a@example.test", name: "A", link: "https://x.test/reset-password/SECRET_TOKEN" }));
  delete process.env.RESEND_API_KEY;
  await sendEmail(passwordResetEmail({ to: "b@example.test", name: "B", link: "https://x.test/reset-password/SECRET_TOKEN" }));
  const rows = await prisma.emailSendFailure.findMany({ orderBy: { toEmail: "asc" } });
  assert.deepEqual(rows.map((r) => r.reason), ["Couldn't reach Resend (TypeError)", "RESEND_API_KEY or EMAIL_FROM not set in production"]);
  assert.ok(!JSON.stringify(rows).includes("SECRET_TOKEN"));
  assert.equal(rows[0].retryKind, null, "no recipe given: can only be marked reviewed");
});

test("outside production nothing is recorded: no key logs, real addresses are suppressed", async () => {
  process.env.VERCEL_ENV = "preview";
  delete process.env.RESEND_API_KEY;
  assert.equal((await sendEmail(passwordResetEmail({ to: "a@example.test", name: "A", link: "https://x.test/r" }))).status, "logged");
  process.env.RESEND_API_KEY = "re_test_dummy";
  assert.equal((await sendEmail(passwordResetEmail({ to: "a@example.test", name: "A", link: "https://x.test/r" }))).status, "suppressed");
  assert.equal(await prisma.emailSendFailure.count(), 0);
});

// ---------------------------------------------------------------- retry

test("retry resends a booking confirmation and marks it RESENT; no new row", async () => {
  const admin = await makeAdmin();
  const b = await makeBooking();
  resend = "reject";
  await sendEmail(bookingConfirmedParentFor((await loadBooking(b.id))!));
  const row = await onlyFailure();

  resend = "ok";
  assert.deepEqual(await retryEmailFailure(row.id, admin.id), { ok: true });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, [b.parentProfile.user.email]);
  const after = await onlyFailure();
  assert.equal(after.resolution, "RESENT");
  assert.equal(after.resolvedById, admin.id);
  assert.equal(after.retryCount, 1);
  assert.deepEqual(await retryEmailFailure(row.id, admin.id), { ok: false, error: "This one is already resolved." });
});

test("retry that fails again keeps the row open with the new error; a second click within a minute is refused", async () => {
  const admin = await makeAdmin();
  const b = await makeBooking();
  resend = "reject";
  await sendEmail(bookingConfirmedParentFor((await loadBooking(b.id))!));
  const row = await onlyFailure();

  resend = "down";
  const now = new Date();
  assert.deepEqual(await retryEmailFailure(row.id, admin.id, now), { ok: false, error: "Still not sent: Couldn't reach Resend (TypeError)" });
  const after = await onlyFailure();
  assert.equal(after.resolvedAt, null);
  assert.equal(after.retryCount, 1);
  assert.equal(after.lastRetryError, "Still not sent: Couldn't reach Resend (TypeError)");

  const again = await retryEmailFailure(row.id, admin.id, new Date(now.getTime() + 10_000));
  assert.equal(again.ok, false);
  assert.match((again as { error: string }).error, /just retried/);

  resend = "ok";
  assert.deepEqual(await retryEmailFailure(row.id, admin.id, new Date(now.getTime() + RETRY_CLAIM_MS + 1000)), { ok: true });
  assert.equal((await onlyFailure()).retryCount, 2);
});

test("retry refuses a confirmation for a booking that's since been cancelled, and sends nothing", async () => {
  const admin = await makeAdmin();
  const b = await makeBooking();
  resend = "reject";
  await sendEmail(bookingConfirmedParentFor((await loadBooking(b.id))!));
  await prisma.booking.update({ where: { id: b.id }, data: { status: "CANCELLED" } });
  resend = "ok";
  const outcome = await retryEmailFailure((await onlyFailure()).id, admin.id);
  assert.deepEqual(outcome, { ok: false, error: "Not resent: The booking is now cancelled, so a confirmation would be wrong." });
  assert.equal(sent.length, 0);
  assert.equal((await onlyFailure()).resolvedAt, null);
});

async function failureFor(kind: string, ref: string, params?: object, createdAt = new Date()) {
  return prisma.emailSendFailure.create({
    data: { toEmail: "x@example.test", subject: "s", reason: "Resend rejected it (500)", retryKind: kind, retryRef: ref, retryParams: params ? JSON.stringify(params) : null, createdAt },
  });
}

test("card-problem retry: sent while the card is still unfixed; refused once fixed or past the deadline", async () => {
  const admin = await makeAdmin();
  const b = await makeBooking({ holdFailedAt: new Date(), stripePaymentIntentId: null });
  const f1 = await failureFor("HOLD_FAILED_PARENT", b.id);
  assert.deepEqual(await retryEmailFailure(f1.id, admin.id), { ok: true });
  assert.match(sent[0].subject, /update your card/);

  const fixed = await makeBooking({ holdFailedAt: new Date(), stripePaymentIntentId: "pi_fixed" });
  const f2 = await failureFor("HOLD_FAILED_PARENT", fixed.id);
  assert.deepEqual(await retryEmailFailure(f2.id, admin.id), { ok: false, error: "Not resent: The card has been fixed: the hold is in place." });

  const late = await makeBooking({ holdFailedAt: new Date(), stripePaymentIntentId: null, scheduledAt: new Date(Date.now() + 6 * HOUR) });
  assert.ok(holdFixDeadline(late.scheduledAt).getTime() < Date.now());
  const f3 = await failureFor("HOLD_FAILED_PARENT", late.id);
  assert.deepEqual(await retryEmailFailure(f3.id, admin.id), { ok: false, error: "Not resent: The deadline to update the card has passed." });
  assert.equal(sent.length, 1);
});

test("reminder retry: the 24-hour reminder is refused under 12 hours out; the 1-hour one until the start", async () => {
  const admin = await makeAdmin();
  const soon = await makeBooking({ scheduledAt: new Date(Date.now() + 5 * HOUR) });
  const f1 = await failureFor("REMINDER_PARENT", soon.id, { kind: "TOMORROW" });
  const r1 = await retryEmailFailure(f1.id, admin.id);
  assert.equal(r1.ok, false);
  assert.match((r1 as { error: string }).error, /less than 12 hours away/);
  const f2 = await failureFor("REMINDER_COACH", soon.id, { kind: "SOON" });
  assert.deepEqual(await retryEmailFailure(f2.id, admin.id), { ok: true });
  assert.match(sent[0].subject, /starting soon/);

  const past = await makeBooking({ scheduledAt: new Date(Date.now() - HOUR) });
  const f3 = await failureFor("REMINDER_PARENT", past.id, { kind: "SOON" });
  assert.deepEqual(await retryEmailFailure(f3.id, admin.id), { ok: false, error: "Not resent: The session has already started." });
});

test("password reset retry: a new working link; refused if they asked again since; a failed retry doesn't block the next", async () => {
  const admin = await makeAdmin();
  const user = await prisma.user.create({ data: { name: "Riley", email: `riley-${randomUUID()}@example.test`, passwordHash: "x", role: "PARENT" } });
  const failedAt = new Date(Date.now() - 10 * MIN);
  // The link from the failed email (its token is only stored hashed).
  await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: "old", expiresAt: new Date(Date.now() + HOUR), createdAt: new Date(failedAt.getTime() - 1000) } });
  const f = await failureFor("PASSWORD_RESET", user.id, undefined, failedAt);

  // Retry that fails: its new link is discarded.
  resend = "reject";
  const now = new Date();
  assert.equal((await retryEmailFailure(f.id, admin.id, now)).ok, false);
  assert.equal(await prisma.passwordResetToken.count({ where: { userId: user.id, createdAt: { gt: failedAt } } }), 0);

  // Next retry works and the link in the email is the one stored (hashed).
  resend = "ok";
  assert.deepEqual(await retryEmailFailure(f.id, admin.id, new Date(now.getTime() + RETRY_CLAIM_MS + 1000)), { ok: true });
  const token = /reset-password\/([A-Za-z0-9_-]{43})/.exec(sent[0].text)?.[1];
  assert.ok(token, "the email has a reset link");
  const stored = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashResetToken(token!) } });
  assert.ok(stored && !stored.usedAt);
  assert.ok((await prisma.passwordResetToken.findUnique({ where: { tokenHash: "old" } }))!.usedAt, "the old link is cancelled");

  // Another failure for the same account, but they've asked again since: refused.
  const f2 = await failureFor("PASSWORD_RESET", user.id, undefined, failedAt);
  const r2 = await retryEmailFailure(f2.id, admin.id);
  assert.equal(r2.ok, false);
  assert.match((r2 as { error: string }).error, /asked for another reset link/);
});

test("emails without a recipe can only be marked reviewed", async () => {
  const admin = await makeAdmin();
  const f = await prisma.emailSendFailure.create({ data: { toEmail: "x@example.test", subject: "New message", reason: "Resend rejected it (500)" } });
  assert.deepEqual(await retryEmailFailure(f.id, admin.id), { ok: false, error: "This email can't be resent from here." });
  assert.equal(await markEmailFailureReviewed(f.id, admin.id), true);
  assert.equal(await markEmailFailureReviewed(f.id, admin.id), false);
  const row = await onlyFailure();
  assert.equal(row.resolution, "REVIEWED");
});
