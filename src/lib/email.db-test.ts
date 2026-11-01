/**
 * Database tests for password reset, sign-out-everywhere, message alert throttling and the
 * "coach waiting for review" alert. They write rows, so they refuse to run unless pointed at a
 * scratch database copy:
 *
 *   DATABASE_URL=file:/path/to/scratch-copy.db EMAIL_DB_TEST=1 NEXTAUTH_SECRET=test-only \
 *   npx tsx --test src/lib/email.db-test.ts
 *
 * The scratch copy needs prisma/sql/2026-11-01-real-email.sql applied first
 * (node scripts/apply-sql.mjs <copy> --apply). No RESEND_API_KEY is set, so every email is
 * only logged (with links removed), never sent.
 * Not matched by `npm test` (*.test.ts), so the normal suite never touches a database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import type { JWT } from "next-auth/jwt";
import { prisma } from "./prisma";
import {
  hashResetToken,
  isResetTokenUsable,
  requestPasswordReset,
  resetPassword,
  RESET_LIMIT_PER_ACCOUNT,
  RESET_LIMIT_PER_IP,
} from "./passwordReset";
import { sendCoachReviewAlert, sendNewMessageAlert, MESSAGE_ALERT_INTERVAL_MS } from "./notify";
import { authOptions } from "./auth";

const url = process.env.DATABASE_URL ?? "";
if (process.env.EMAIL_DB_TEST !== "1" || !url.startsWith("file:") || /(^|[\\/:])dev\.db$/.test(url)) {
  throw new Error("Refusing to run: set EMAIL_DB_TEST=1 and point DATABASE_URL at a scratch copy (not dev.db).");
}
if (process.env.RESEND_API_KEY) throw new Error("Refusing to run with RESEND_API_KEY set: these tests must not send email.");

const MIN = 60 * 1000;
const ip = () => `203.0.113.${Math.floor(Math.random() * 250)}-${randomUUID()}`;

async function makeUser(role: "PARENT" | "COACH" = "PARENT", password = "old-password-1") {
  return prisma.user.create({
    data: {
      name: `Test ${role === "PARENT" ? "Parent" : "Coach"}`,
      email: `${role.toLowerCase()}-${randomUUID()}@resend.dev`,
      passwordHash: await bcrypt.hash(password, 4),
      role,
    },
  });
}

const jwtCallback = authOptions.callbacks!.jwt! as (args: { token: JWT; user?: unknown }) => Promise<JWT>;

test("reset request: same outcome shape for unknown emails, and a hashed, 1-hour token for real ones", async () => {
  const unknown = await requestPasswordReset({ email: `nobody-${randomUUID()}@resend.dev`, ip: ip() });
  assert.equal(unknown.status, "NO_ACCOUNT");

  const user = await makeUser();
  const now = new Date();
  const r = await requestPasswordReset({ email: user.email.toUpperCase(), ip: ip(), now });
  assert.equal(r.status, "SENT");
  if (r.status !== "SENT") return;
  const rows = await prisma.passwordResetToken.findMany({ where: { userId: user.id } });
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].tokenHash, r.token, "the raw token is never stored");
  assert.equal(rows[0].tokenHash, hashResetToken(r.token));
  assert.equal(rows[0].expiresAt.getTime() - now.getTime(), 60 * MIN);
  assert.equal(await isResetTokenUsable(r.token), true);
});

test("asking again cancels the earlier link", async () => {
  const user = await makeUser();
  const first = await requestPasswordReset({ email: user.email, ip: ip() });
  const second = await requestPasswordReset({ email: user.email, ip: ip() });
  assert.ok(first.status === "SENT" && second.status === "SENT");
  assert.equal(await isResetTokenUsable(first.token), false);
  assert.equal(await isResetTokenUsable(second.token), true);
});

test(`rate limits: ${RESET_LIMIT_PER_ACCOUNT} links per account and ${RESET_LIMIT_PER_IP} requests per IP, per hour`, async () => {
  const user = await makeUser();
  for (let i = 0; i < RESET_LIMIT_PER_ACCOUNT; i++) {
    assert.equal((await requestPasswordReset({ email: user.email, ip: ip() })).status, "SENT");
  }
  assert.equal((await requestPasswordReset({ email: user.email, ip: ip() })).status, "ACCOUNT_LIMIT");
  // An hour later the account can ask again.
  const later = new Date(Date.now() + 61 * MIN);
  assert.equal((await requestPasswordReset({ email: user.email, ip: ip(), now: later })).status, "SENT");

  const sharedIp = ip();
  for (let i = 0; i < RESET_LIMIT_PER_IP; i++) {
    await requestPasswordReset({ email: `nobody-${randomUUID()}@resend.dev`, ip: sharedIp });
  }
  const other = await makeUser();
  assert.equal((await requestPasswordReset({ email: other.email, ip: sharedIp })).status, "IP_LIMIT");
  const stored = await prisma.passwordResetRequest.findMany({ take: 5, orderBy: { createdAt: "desc" } });
  assert.ok(stored.every((row) => /^[0-9a-f]{64}$/.test(row.ipHash)), "IPs are stored only as HMACs");
});

test("reset: works once, changes the password, and signs out every existing session", async () => {
  const user = await makeUser("PARENT", "old-password-1");
  // A session signed in before the reset, and one from before sessionVersion existed.
  const signedIn = await jwtCallback({ token: {} as JWT, user: { id: user.id, role: "PARENT", sessionVersion: user.sessionVersion } });
  const legacy = { id: user.id, role: "PARENT" } as JWT;
  assert.ok(await jwtCallback({ token: signedIn }), "valid before the reset");
  assert.ok(await jwtCallback({ token: legacy }), "old sessions without a version stay valid on deploy");

  const r = await requestPasswordReset({ email: user.email, ip: ip() });
  assert.equal(r.status, "SENT");
  if (r.status !== "SENT") return;
  const done = await resetPassword({ token: r.token, newPassword: "new-password-2" });
  assert.equal(done.ok, true);

  const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(after.sessionVersion, user.sessionVersion + 1);
  assert.ok(await bcrypt.compare("new-password-2", after.passwordHash));
  await assert.rejects(jwtCallback({ token: signedIn }), /Session ended/);
  await assert.rejects(jwtCallback({ token: legacy }), /Session ended/);

  const again = await resetPassword({ token: r.token, newPassword: "third-password-3" });
  assert.equal(again.ok, false, "a link works once");
  assert.ok(await bcrypt.compare("new-password-2", (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash));

  const fresh = await jwtCallback({ token: {} as JWT, user: { id: user.id, role: "PARENT", sessionVersion: after.sessionVersion } });
  assert.ok(await jwtCallback({ token: fresh }), "signing in again works");
});

test("reset: an expired link is refused", async () => {
  const user = await makeUser();
  const r = await requestPasswordReset({ email: user.email, ip: ip() });
  assert.equal(r.status, "SENT");
  if (r.status !== "SENT") return;
  const result = await resetPassword({ token: r.token, newPassword: "new-password-2", now: new Date(Date.now() + 61 * MIN) });
  assert.equal(result.ok, false);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion, 0);
});

test("message alerts: at most one per conversation per hour, and none when turned off", async () => {
  const parentUser = await makeUser("PARENT");
  const coachUser = await makeUser("COACH");
  const parent = await prisma.parentProfile.create({ data: { userId: parentUser.id, referralCode: `T${randomUUID().slice(0, 10)}` } });
  const coach = await prisma.coachProfile.create({ data: { userId: coachUser.id } });
  const thread = await prisma.thread.create({ data: { parentProfileId: parent.id, coachProfileId: coach.id } });

  const t0 = new Date();
  assert.equal(await sendNewMessageAlert(thread.id, parentUser.id, t0), "sent");
  assert.equal(await sendNewMessageAlert(thread.id, parentUser.id, new Date(t0.getTime() + 10 * MIN)), "throttled");
  // The other side has its own hour.
  assert.equal(await sendNewMessageAlert(thread.id, coachUser.id, new Date(t0.getTime() + 10 * MIN)), "sent");
  assert.equal(await sendNewMessageAlert(thread.id, parentUser.id, new Date(t0.getTime() + MESSAGE_ALERT_INTERVAL_MS + MIN)), "sent");

  await prisma.user.update({ where: { id: coachUser.id }, data: { messageEmailAlerts: false } });
  assert.equal(await sendNewMessageAlert(thread.id, parentUser.id, new Date(t0.getTime() + 5 * MESSAGE_ALERT_INTERVAL_MS)), "off");

  // Two messages at the same moment: only one email.
  await prisma.user.update({ where: { id: coachUser.id }, data: { messageEmailAlerts: true } });
  const t1 = new Date(t0.getTime() + 10 * MESSAGE_ALERT_INTERVAL_MS);
  const results = await Promise.all([sendNewMessageAlert(thread.id, parentUser.id, t1), sendNewMessageAlert(thread.id, parentUser.id, t1)]);
  assert.deepEqual(results.sort(), ["sent", "throttled"]);
});

test("coach review alert: once when the coach finishes their steps, again after an ID rejection", async () => {
  const coachUser = await makeUser("COACH");
  const profile = await prisma.coachProfile.create({
    data: {
      userId: coachUser.id,
      bio: "Varsity point guard",
      hourlyRateCents: 4000,
      city: "Palo Alto",
      state: "CA",
      schoolLevel: "HIGH_SCHOOL",
      schoolName: "Paly",
      gradYear: 2027,
      conductAcknowledged: true,
      profilePhotoUrl: "https://example.test/p.jpg",
      sports: { create: { sport: "BASKETBALL" } },
      availability: { create: { dayOfWeek: 6, startMinute: 600, endMinute: 720 } },
    },
  });
  assert.equal(await sendCoachReviewAlert(coachUser.id), "not_waiting", "no ID uploaded yet");

  await prisma.coachProfile.update({ where: { id: profile.id }, data: { idPhotoPath: "ids/x.jpg" } });
  assert.equal(await sendCoachReviewAlert(coachUser.id), "sent");
  assert.equal(await sendCoachReviewAlert(coachUser.id), "already_sent", "editing the profile again doesn't re-alert");

  const { setIdVerificationStatus } = await import("./minorConsent");
  await setIdVerificationStatus(profile.id, "REJECTED", { minorCoachesEnabled: false, isCurrentIdViewed: () => true });
  assert.equal((await prisma.coachProfile.findUniqueOrThrow({ where: { id: profile.id } })).reviewAlertSentAt, null);
  assert.equal(await sendCoachReviewAlert(coachUser.id), "not_waiting", "a rejected ID isn't the coach's part done");

  await prisma.coachProfile.update({ where: { id: profile.id }, data: { idPhotoPath: "ids/y.jpg", idVerificationStatus: "PENDING" } });
  assert.equal(await sendCoachReviewAlert(coachUser.id), "sent", "the resubmission alerts again");
});
