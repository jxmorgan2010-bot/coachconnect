/**
 * Database tests for the Minor Coach consent flow. They write rows, so they refuse to run
 * unless pointed at a scratch database copy:
 *
 *   DATABASE_URL=file:/path/to/scratch-copy.db MINOR_CONSENT_DB_TEST=1 \
 *   ENABLE_MINOR_COACHES=true MINOR_COACHES_LEGAL_REVIEW_CONFIRMED=true \
 *   npm run test:db
 *
 * The scratch copy needs prisma/sql/2026-10-07-minor-coach-consent.sql applied first.
 * Not matched by `npm test` (*.test.ts), so the normal suite never touches a database.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "crypto";
import { prisma } from "./prisma";
import { ENABLE_MINOR_COACHES } from "./flags";
import { isCoachLive } from "./coach";
import { MINOR_CONSENT_TEXT_VERSION, REQUIRED_ACKNOWLEDGMENT_KEYS } from "./legal/minorConsentText";
import {
  createConsentRequest,
  lookupConsentToken,
  completeConsent,
  revokeConsent,
  recheckBookingsAfterRevocation,
  setIdVerificationStatus,
  minorMediaUploadBlockedMessage,
  coachConsentStatus,
  sameEmail,
  MinorConsentError,
  REVOKED_CANCEL_REASON,
  CONSENT_LINK_TTL_DAYS,
} from "./minorConsent";

const url = process.env.DATABASE_URL ?? "";
if (process.env.MINOR_CONSENT_DB_TEST !== "1" || !url.startsWith("file:") || /(^|[\\/:])dev\.db$/.test(url)) {
  throw new Error("Refusing to run: set MINOR_CONSENT_DB_TEST=1 and point DATABASE_URL at a scratch copy (not dev.db).");
}

const DAY = 24 * 60 * 60 * 1000;
const meta = { ip: "203.0.113.7", userAgent: "node-test" };

before(() => {
  assert.equal(ENABLE_MINOR_COACHES, true, "run with ENABLE_MINOR_COACHES=true and MINOR_COACHES_LEGAL_REVIEW_CONFIRMED=true");
});

async function makeCoach({ minor = true, email }: { minor?: boolean; email?: string } = {}) {
  const user = await prisma.user.create({
    data: {
      name: minor ? "Riley Teen" : "Adult Coach",
      email: email ?? `coach-${randomUUID()}@example.test`,
      passwordHash: "x",
      role: "COACH",
      coachProfile: {
        create: {
          isMinorCoach: minor,
          dateOfBirth: new Date(Date.UTC(minor ? 2009 : 1999, 0, 1)),
          hourlyRateCents: 4000,
          idPhotoPath: "test.jpg",
        },
      },
    },
    include: { coachProfile: true },
  });
  return { user, profile: user.coachProfile! };
}

async function makeParent(creditCents = 0) {
  const user = await prisma.user.create({
    data: {
      name: "Booking Parent",
      email: `parent-${randomUUID()}@example.test`,
      passwordHash: "x",
      role: "PARENT",
      parentProfile: { create: { referralCode: `T${randomUUID().slice(0, 10)}`, creditCents } },
    },
    include: { parentProfile: true },
  });
  return user.parentProfile!;
}

function signature(over: Partial<Parameters<typeof completeConsent>[1]> = {}) {
  return {
    consentTextVersion: MINOR_CONSENT_TEXT_VERSION,
    acknowledgedKeys: [...REQUIRED_ACKNOWLEDGMENT_KEYS],
    signerLegalName: "Pat Rivera",
    signerRelationship: "Parent",
    emergencyContactName: "Sam Rivera",
    emergencyContactPhone: "(415) 555-0100",
    confirmedAdult: true as const,
    typedSignature: "  pat   RIVERA ",
    ...over,
  };
}

async function rejectsWith(promise: Promise<unknown>, status: number, pattern?: RegExp) {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof MinorConsentError, `expected MinorConsentError, got ${String(err)}`);
    assert.equal(err.status, status, err.message);
    if (pattern) assert.match(err.message, pattern);
    return true;
  });
}

test("a consent link stores only a hash of its token and expires after 7 days", async () => {
  const { profile } = await makeCoach();
  const now = new Date();
  const { token, consent } = await createConsentRequest({ coachProfileId: profile.id, guardianName: "Pat Rivera", guardianEmail: "Pat@Example.test", now });
  const row = await prisma.minorConsent.findUniqueOrThrow({ where: { id: consent.id } });
  assert.equal(row.tokenHash, createHash("sha256").update(token).digest("hex"));
  assert.ok(!JSON.stringify(row).includes(token), "raw token must not be stored anywhere on the row");
  assert.equal(row.expiresAt.getTime() - now.getTime(), CONSENT_LINK_TTL_DAYS * DAY);
  assert.equal(row.guardianEmail, "pat@example.test");
});

test("parent email equal to the teen's email is rejected, including different capitalization", async () => {
  const { profile } = await makeCoach({ email: `teen-${randomUUID()}@example.test` });
  const teen = await prisma.user.findUniqueOrThrow({ where: { id: profile.userId } });
  for (const guardianEmail of [teen.email, teen.email.toUpperCase(), `  ${teen.email.replace("teen", "TeEn")}  `]) {
    await rejectsWith(createConsentRequest({ coachProfileId: profile.id, guardianName: "Pat", guardianEmail }), 400, /different from your own email/);
  }
  assert.equal(await prisma.minorConsent.count({ where: { coachProfileId: profile.id } }), 0);
  assert.equal(sameEmail("A@B.com ", "a@b.COM"), true);
});

test("an expired link can't be used (and works right up to the 7-day mark)", async () => {
  const { profile } = await makeCoach();
  const created = new Date(Date.now() - 8 * DAY);
  const { token } = await createConsentRequest({ coachProfileId: profile.id, guardianName: "Pat Rivera", guardianEmail: "pat@example.test", now: created });
  assert.equal((await lookupConsentToken(token)).state, "EXPIRED");
  await rejectsWith(completeConsent(token, signature(), meta), 410, /expired/);
  assert.equal(coachConsentStatus(await prisma.minorConsent.findMany({ where: { coachProfileId: profile.id } })).status, "EXPIRED");

  const other = await makeCoach();
  const t0 = new Date();
  const fresh = await createConsentRequest({ coachProfileId: other.profile.id, guardianName: "Pat Rivera", guardianEmail: "pat@example.test", now: t0 });
  assert.equal((await lookupConsentToken(fresh.token, new Date(t0.getTime() + 7 * DAY))).state, "EXPIRED");
  await completeConsent(fresh.token, signature(), meta, new Date(t0.getTime() + 7 * DAY - 60_000));
});

test("a used link can't be reused", async () => {
  const { profile } = await makeCoach();
  const { token } = await createConsentRequest({ coachProfileId: profile.id, guardianName: "Pat Rivera", guardianEmail: "pat@example.test" });
  await completeConsent(token, signature(), meta);
  assert.equal((await lookupConsentToken(token)).state, "USED");
  await rejectsWith(completeConsent(token, signature(), meta), 409, /already been used/);
  // ...and once signed, the teen can't start a new request over the top of it.
  await rejectsWith(createConsentRequest({ coachProfileId: profile.id, guardianName: "X", guardianEmail: "x@example.test" }), 409);
});

test("requesting a new link supersedes the old one", async () => {
  const { profile } = await makeCoach();
  const first = await createConsentRequest({ coachProfileId: profile.id, guardianName: "Pat Rivera", guardianEmail: "pat@example.test" });
  const second = await createConsentRequest({ coachProfileId: profile.id, guardianName: "Pat Rivera", guardianEmail: "pat.rivera@example.test" });
  assert.equal((await lookupConsentToken(first.token)).state, "SUPERSEDED");
  await rejectsWith(completeConsent(first.token, signature(), meta), 410, /newer consent link/);
  await completeConsent(second.token, signature(), meta);
  const rows = await prisma.minorConsent.findMany({ where: { coachProfileId: profile.id } });
  assert.equal(coachConsentStatus(rows).status, "COMPLETED");
});

test("an incomplete or mismatched signature is refused without using up the link", async () => {
  const { profile } = await makeCoach();
  const { token } = await createConsentRequest({ coachProfileId: profile.id, guardianName: "Pat Rivera", guardianEmail: "pat@example.test" });
  await rejectsWith(completeConsent(token, signature({ consentTextVersion: "old-version" }), meta), 409, /updated/);
  await rejectsWith(completeConsent(token, signature({ acknowledgedKeys: REQUIRED_ACKNOWLEDGMENT_KEYS.slice(1) }), meta), 400, /Tick each/);
  await rejectsWith(completeConsent(token, signature({ typedSignature: "Someone Else" }), meta), 400, /match/);
  assert.equal((await lookupConsentToken(token)).state, "VALID");
  await completeConsent(token, signature(), meta);
});

test("signing stores the full signature record and the consent cache", async () => {
  const { profile } = await makeCoach();
  const { token, consent } = await createConsentRequest({ coachProfileId: profile.id, guardianName: "Pat", guardianEmail: "pat@example.test" });
  const { revokeToken } = await completeConsent(token, signature(), meta);
  const row = await prisma.minorConsent.findUniqueOrThrow({ where: { id: consent.id } });
  assert.ok(row.completedAt);
  assert.equal(row.consentTextVersion, MINOR_CONSENT_TEXT_VERSION);
  assert.deepEqual(JSON.parse(row.acknowledgedKeys!), [...REQUIRED_ACKNOWLEDGMENT_KEYS]);
  assert.equal(row.signerLegalName, "Pat Rivera");
  assert.equal(row.signerRelationship, "Parent");
  assert.equal(row.guardianEmail, "pat@example.test");
  assert.equal(row.confirmedAdult, true);
  assert.equal(row.emergencyContactPhone, "(415) 555-0100");
  assert.equal(row.signerIp, "203.0.113.7");
  assert.equal(row.signerUserAgent, "node-test");
  assert.equal(row.revokeTokenHash, createHash("sha256").update(revokeToken).digest("hex"));
  const cached = await prisma.coachProfile.findUniqueOrThrow({ where: { id: profile.id } });
  assert.equal(cached.minorGuardianName, "Pat Rivera");
  assert.equal(cached.minorGuardianConsentedAt?.getTime(), row.completedAt.getTime());
});

test("admin approval of a minor is blocked on the server without completed consent", async () => {
  const { profile } = await makeCoach();
  await rejectsWith(setIdVerificationStatus(profile.id, "APPROVED", { minorCoachesEnabled: true }), 409, /consent/);

  const { token } = await createConsentRequest({ coachProfileId: profile.id, guardianName: "Pat", guardianEmail: "pat@example.test" });
  await rejectsWith(setIdVerificationStatus(profile.id, "APPROVED", { minorCoachesEnabled: true }), 409, /consent/);

  await completeConsent(token, signature(), meta);
  await rejectsWith(setIdVerificationStatus(profile.id, "APPROVED", { minorCoachesEnabled: false }), 403, /tier is off/);
  await setIdVerificationStatus(profile.id, "APPROVED", { minorCoachesEnabled: true });
  assert.equal((await prisma.coachProfile.findUniqueOrThrow({ where: { id: profile.id } })).idVerificationStatus, "APPROVED");

  // Rejecting is never blocked, and adults are unaffected.
  await setIdVerificationStatus(profile.id, "REJECTED", { minorCoachesEnabled: true });
  const adult = await makeCoach({ minor: false });
  await setIdVerificationStatus(adult.profile.id, "APPROVED", { minorCoachesEnabled: false });
});

test("a minor can't upload ID or photos until consent is signed", async () => {
  const { profile } = await makeCoach();
  assert.match((await minorMediaUploadBlockedMessage(profile)) ?? "", /parent or guardian needs to sign/);
  const { token } = await createConsentRequest({ coachProfileId: profile.id, guardianName: "Pat", guardianEmail: "pat@example.test" });
  assert.notEqual(await minorMediaUploadBlockedMessage(profile), null);
  await completeConsent(token, signature(), meta);
  assert.equal(await minorMediaUploadBlockedMessage(profile), null);
  const adult = await makeCoach({ minor: false });
  assert.equal(await minorMediaUploadBlockedMessage(adult.profile), null);
});

test("revoking consent unpublishes the profile and cancels upcoming sessions", async () => {
  const { profile } = await makeCoach();
  const { token } = await createConsentRequest({ coachProfileId: profile.id, guardianName: "Pat", guardianEmail: "pat@example.test" });
  const { revokeToken } = await completeConsent(token, signature(), meta);
  await setIdVerificationStatus(profile.id, "APPROVED", { minorCoachesEnabled: true });
  await prisma.coachProfile.update({ where: { id: profile.id }, data: { minorBackgroundCheckNote: "School ID + call with parent" } });
  const loadLive = async () =>
    isCoachLive(await prisma.coachProfile.findUniqueOrThrow({ where: { id: profile.id }, include: { user: true } }));
  assert.equal(await loadLive(), true);

  const parent = await makeParent(0);
  const base = {
    parentProfileId: parent.id,
    coachProfileId: profile.id,
    sport: "SOCCER" as const,
    durationMinutes: 60,
    locationText: "Dolores Park",
    priceCents: 4000,
    platformFeeCents: 600,
    status: "CONFIRMED" as const,
    secondAdultName: "Jordan Lee",
  };
  const pkg = await prisma.sessionPackage.create({
    data: { parentProfileId: parent.id, coachProfileId: profile.id, sport: "SOCCER", durationMinutes: 60, totalSessions: 5, sessionsUsed: 1, pricePerSessionCents: 3600, discountPercent: 10, totalChargedCents: 18000, stripePaymentIntentId: `pi_pkg_${randomUUID()}` },
  });
  const piOk = `pi_ok_${randomUUID()}`;
  const piFail = `pi_fail_${randomUUID()}`;
  const card = await prisma.booking.create({ data: { ...base, scheduledAt: new Date(Date.now() + 3 * DAY), discountCents: 500, stripePaymentIntentId: piOk } });
  const fromPackage = await prisma.booking.create({ data: { ...base, scheduledAt: new Date(Date.now() + 4 * DAY), discountCents: 400, packageId: pkg.id, paymentStatus: "CAPTURED" } });
  const voidFails = await prisma.booking.create({ data: { ...base, scheduledAt: new Date(Date.now() + 5 * DAY), stripePaymentIntentId: piFail } });
  const past = await prisma.booking.create({ data: { ...base, scheduledAt: new Date(Date.now() - DAY), stripePaymentIntentId: `pi_past_${randomUUID()}` } });

  const voided: (string | null)[] = [];
  const voidHold = async (id: string | null) => {
    voided.push(id);
    if (id === piFail) throw new Error("Stripe unavailable");
  };
  const result = await revokeConsent(revokeToken, { ip: "198.51.100.9", userAgent: "revoker" }, { voidHold });

  assert.equal(result.alreadyRevoked, false);
  assert.deepEqual(new Set(result.cancelledBookingIds), new Set([card.id, fromPackage.id, voidFails.id]));
  assert.deepEqual(result.holdsNotVoided, [voidFails.id]);
  assert.deepEqual(new Set(voided), new Set([piOk, piFail]));

  // Unpublished, back in the review queue, cache cleared.
  assert.equal(await loadLive(), false);
  const after = await prisma.coachProfile.findUniqueOrThrow({ where: { id: profile.id } });
  assert.equal(after.idVerificationStatus, "PENDING");
  assert.equal(after.minorGuardianConsentedAt, null);
  const consentRow = await prisma.minorConsent.findFirstOrThrow({ where: { coachProfileId: profile.id } });
  assert.ok(consentRow.revokedAt);
  assert.equal(consentRow.revokeIp, "198.51.100.9");
  assert.equal(coachConsentStatus([consentRow]).status, "REVOKED");

  const get = (id: string) => prisma.booking.findUniqueOrThrow({ where: { id } });
  const cardAfter = await get(card.id);
  assert.equal(cardAfter.status, "CANCELLED");
  assert.equal(cardAfter.paymentStatus, "CANCELLED");
  assert.equal(cardAfter.cancelReason, REVOKED_CANCEL_REASON);
  assert.ok(cardAfter.cancelledAt);
  const pkgBookingAfter = await get(fromPackage.id);
  assert.equal(pkgBookingAfter.status, "CANCELLED");
  assert.equal(pkgBookingAfter.paymentStatus, "REFUNDED");
  const failAfter = await get(voidFails.id);
  assert.equal(failAfter.status, "CANCELLED");
  assert.equal(failAfter.paymentStatus, "AUTHORIZED", "a hold that couldn't be voided stays visible for admin follow-up");
  assert.equal((await get(past.id)).status, "CONFIRMED", "sessions that already started are left alone");

  const pkgAfter = await prisma.sessionPackage.findUniqueOrThrow({ where: { id: pkg.id } });
  assert.equal(pkgAfter.sessionsUsed, 0);
  assert.equal(pkgAfter.sessionsRefunded, 1);
  // Referral credit comes back for the card booking only (a package booking's discount isn't credit).
  assert.equal((await prisma.parentProfile.findUniqueOrThrow({ where: { id: parent.id } })).creditCents, 500);

  // Approval is blocked again, and revoking twice changes nothing.
  await rejectsWith(setIdVerificationStatus(profile.id, "APPROVED", { minorCoachesEnabled: true }), 409);
  const again = await revokeConsent(revokeToken, meta, { voidHold });
  assert.equal(again.alreadyRevoked, true);
  assert.equal((await prisma.parentProfile.findUniqueOrThrow({ where: { id: parent.id } })).creditCents, 500);

  // The teen can ask again; the parent would have to sign a new form.
  await createConsentRequest({ coachProfileId: profile.id, guardianName: "Pat", guardianEmail: "pat@example.test" });
  assert.equal(coachConsentStatus(await prisma.minorConsent.findMany({ where: { coachProfileId: profile.id } })).status, "PENDING");
});

test("a revoke link that doesn't exist is a 404", async () => {
  await rejectsWith(revokeConsent("not-a-real-token", meta), 404);
});

// --- Revocation race: bookings written after the first cleanup pass -----------------

async function liveConsentedMinor() {
  const { profile } = await makeCoach();
  const { token } = await createConsentRequest({ coachProfileId: profile.id, guardianName: "Pat", guardianEmail: "pat@example.test" });
  const { revokeToken } = await completeConsent(token, signature(), meta);
  await setIdVerificationStatus(profile.id, "APPROVED", { minorCoachesEnabled: true });
  await prisma.coachProfile.update({ where: { id: profile.id }, data: { minorBackgroundCheckNote: "Checked" } });
  return { profile, revokeToken };
}

function bookingData(parentProfileId: string, coachProfileId: string, daysAhead: number, extra: Record<string, unknown> = {}) {
  return {
    parentProfileId,
    coachProfileId,
    sport: "SOCCER" as const,
    durationMinutes: 60,
    locationText: "Dolores Park",
    priceCents: 4000,
    platformFeeCents: 600,
    status: "CONFIRMED" as const,
    secondAdultName: "Jordan Lee",
    scheduledAt: new Date(Date.now() + daysAhead * DAY),
    ...extra,
  };
}

test("race: a booking written while the first pass is voiding holds is cancelled by the immediate re-check", async () => {
  const { profile, revokeToken } = await liveConsentedMinor();
  const parent = await makeParent(0);
  const existing = await prisma.booking.create({ data: bookingData(parent.id, profile.id, 3, { stripePaymentIntentId: `pi_a_${randomUUID()}` }) });

  // The in-flight booking commits during the first pass (here: while its first hold is being voided).
  const racingPi = `pi_race_${randomUUID()}`;
  let racing: { id: string } | null = null;
  const voided: (string | null)[] = [];
  const voidHold = async (id: string | null) => {
    voided.push(id);
    if (!racing) {
      racing = await prisma.booking.create({ data: bookingData(parent.id, profile.id, 6, { stripePaymentIntentId: racingPi, discountCents: 300 }) });
    }
  };

  const result = await revokeConsent(revokeToken, meta, { voidHold });
  assert.ok(racing, "the racing booking was written mid-revocation");
  const racingId = (racing as { id: string }).id;
  assert.deepEqual(new Set(result.cancelledBookingIds), new Set([existing.id, racingId]));
  assert.ok(voided.includes(racingPi), "the racing booking's hold was voided");
  const after = await prisma.booking.findUniqueOrThrow({ where: { id: racingId } });
  assert.equal(after.status, "CANCELLED");
  assert.equal(after.paymentStatus, "CANCELLED");
  assert.equal(after.cancelReason, REVOKED_CANCEL_REASON);
  assert.equal((await prisma.parentProfile.findUniqueOrThrow({ where: { id: parent.id } })).creditCents, 300, "referral credit returned");
});

test("race: bookings written after revocation returns are cancelled by the delayed re-check, once", async () => {
  const { profile, revokeToken } = await liveConsentedMinor();
  const result = await revokeConsent(revokeToken, meta, { voidHold: async () => {} });
  assert.ok(result.revokedAt);
  assert.deepEqual(result.cancelledBookingIds, []);

  // Late arrivals: a card booking and a package booking that were still in flight.
  const parent = await makeParent(0);
  const pkg = await prisma.sessionPackage.create({
    data: { parentProfileId: parent.id, coachProfileId: profile.id, sport: "SOCCER", durationMinutes: 60, totalSessions: 5, sessionsUsed: 1, pricePerSessionCents: 3600, discountPercent: 10, totalChargedCents: 18000, stripePaymentIntentId: `pi_pkg_${randomUUID()}` },
  });
  const latePi = `pi_late_${randomUUID()}`;
  const lateCard = await prisma.booking.create({ data: bookingData(parent.id, profile.id, 2, { stripePaymentIntentId: latePi, discountCents: 250 }) });
  const latePkg = await prisma.booking.create({ data: bookingData(parent.id, profile.id, 4, { packageId: pkg.id, paymentStatus: "CAPTURED", discountCents: 400 }) });
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: lateCard.id } })).status, "CONFIRMED", "missed by revokeConsent itself");

  const voided: (string | null)[] = [];
  const late = await recheckBookingsAfterRevocation(profile.id, result.revokedAt!, { voidHold: async (id) => void voided.push(id) });
  assert.deepEqual(new Set(late.cancelledBookingIds), new Set([lateCard.id, latePkg.id]));
  assert.deepEqual([...voided], [latePi]);
  const card = await prisma.booking.findUniqueOrThrow({ where: { id: lateCard.id } });
  assert.equal(card.status, "CANCELLED");
  assert.equal(card.paymentStatus, "CANCELLED");
  const fromPkg = await prisma.booking.findUniqueOrThrow({ where: { id: latePkg.id } });
  assert.equal(fromPkg.status, "CANCELLED");
  assert.equal(fromPkg.paymentStatus, "REFUNDED");
  const pkgAfter = await prisma.sessionPackage.findUniqueOrThrow({ where: { id: pkg.id } });
  assert.equal(pkgAfter.sessionsUsed, 0);
  assert.equal(pkgAfter.sessionsRefunded, 1);
  assert.equal((await prisma.parentProfile.findUniqueOrThrow({ where: { id: parent.id } })).creditCents, 250, "card booking's credit returned, package discount isn't credit");

  // Running it again changes nothing.
  const again = await recheckBookingsAfterRevocation(profile.id, result.revokedAt!, { voidHold: async (id) => void voided.push(id) });
  assert.deepEqual(again.cancelledBookingIds, []);
  assert.deepEqual([...voided], [latePi]);
  assert.equal((await prisma.parentProfile.findUniqueOrThrow({ where: { id: parent.id } })).creditCents, 250);
});

test("race: the re-check leaves alone started sessions, bookings outside its window, and anything after consent is signed again", async () => {
  const { profile, revokeToken } = await liveConsentedMinor();
  const { revokedAt } = await revokeConsent(revokeToken, meta, { voidHold: async () => {} });
  const parent = await makeParent(0);
  const started = await prisma.booking.create({ data: bookingData(parent.id, profile.id, -0.01) });
  const outsideWindow = await prisma.booking.create({
    data: bookingData(parent.id, profile.id, 3, { createdAt: new Date(revokedAt!.getTime() - 10 * 60 * 1000) }),
  });
  const noVoid = async () => assert.fail("nothing should be voided");
  assert.deepEqual((await recheckBookingsAfterRevocation(profile.id, revokedAt!, { voidHold: noVoid })).cancelledBookingIds, []);
  for (const id of [started.id, outsideWindow.id]) {
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id } })).status, "CONFIRMED");
  }

  // The parent signs a new consent; a delayed re-check from the old revocation must not touch new bookings.
  const { token } = await createConsentRequest({ coachProfileId: profile.id, guardianName: "Pat", guardianEmail: "pat@example.test" });
  await completeConsent(token, signature(), meta);
  const newBooking = await prisma.booking.create({ data: bookingData(parent.id, profile.id, 5) });
  assert.deepEqual((await recheckBookingsAfterRevocation(profile.id, revokedAt!, { voidHold: noVoid })).cancelledBookingIds, []);
  assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: newBooking.id } })).status, "CONFIRMED");
});
