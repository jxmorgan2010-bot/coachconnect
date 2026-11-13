import { prisma } from "@/lib/prisma";
import { later, sendEmail, withRetry, type Email } from "@/lib/email";
import {
  bookingConfirmedParentEmail,
  bookingNewCoachEmail,
  coachAwaitingReviewEmail,
  coachCancelledParentEmail,
  newMessageEmail,
  newReportEmail,
  parentCancelledCoachEmail,
  parentCancelledParentEmail,
  refundIssuedEmail,
  refundRequestEmail,
  type BookingFacts,
  withCalendar,
} from "@/lib/emails";
import { toCalendarSession } from "@/lib/calendar";
import type { ParentCancelOutcome } from "@/lib/cancellation";
import { getCoachReviewStatus } from "@/lib/coachReview";

/**
 * Who gets which email, and when. Every function here returns right away: loading the data and
 * sending happen after the response (src/lib/email.ts `later`), so an email can never slow down
 * or fail a booking, a cancellation or a refund.
 */

export const MESSAGE_ALERT_INTERVAL_MS = 60 * 60 * 1000;

const bookingInclude = {
  parentProfile: { include: { user: true } },
  coachProfile: { include: { user: true } },
  child: true,
  package: true,
} as const;

export async function loadBooking(bookingId: string) {
  return prisma.booking.findUnique({ where: { id: bookingId }, include: bookingInclude });
}
export type LoadedBooking = NonNullable<Awaited<ReturnType<typeof loadBooking>>>;

function bookingFacts(b: LoadedBooking): BookingFacts {
  return {
    coachName: b.coachProfile.user.name,
    parentName: b.parentProfile.user.name,
    childFirstName: b.child?.firstName ?? null,
    sport: b.sport,
    scheduledAt: b.scheduledAt,
    durationMinutes: b.durationMinutes,
    locationText: b.locationText,
    priceCents: b.priceCents,
    discountCents: b.discountCents,
    packageSessionsLeft: b.package
      ? Math.max(0, b.package.totalSessions - b.package.sessionsUsed - b.package.sessionsCashRefunded)
      : null,
    hasCardHold: !b.packageId && !!b.stripePaymentIntentId,
    cardHoldDueAt: !b.packageId && !b.stripePaymentIntentId ? b.holdDueAt : null,
  };
}

// ---------------------------------------------------------------- bookings

// The builders below are shared by the notify* functions and by admin retries
// (src/lib/emailRetry.ts), so a resent email is built exactly like the original. Each carries its
// retry recipe.

export function bookingConfirmedParentFor(b: LoadedBooking): Email {
  return withRetry(
    withCalendar(bookingConfirmedParentEmail(b.parentProfile.user.email, bookingFacts(b)), toCalendarSession(b), "PARENT"),
    { kind: "BOOKING_CONFIRMED_PARENT", ref: b.id },
  );
}

export function bookingNewCoachFor(b: LoadedBooking): Email {
  return withRetry(
    withCalendar(bookingNewCoachEmail(b.coachProfile.user.email, bookingFacts(b)), toCalendarSession(b), "COACH"),
    { kind: "BOOKING_NEW_COACH", ref: b.id },
  );
}

export function parentCancelledFor(b: LoadedBooking, audience: "PARENT" | "COACH", outcome: ParentCancelOutcome, stripeOk: boolean): Email {
  const facts = { ...bookingFacts(b), outcome, stripeOk };
  const params = { outcome, stripeOk };
  return audience === "PARENT"
    ? withRetry(parentCancelledParentEmail(b.parentProfile.user.email, facts), { kind: "PARENT_CANCELLED_PARENT", ref: b.id, params })
    : withRetry(parentCancelledCoachEmail(b.coachProfile.user.email, facts), { kind: "PARENT_CANCELLED_COACH", ref: b.id, params });
}

export function coachCancelledParentFor(b: LoadedBooking, stripeOk: boolean): Email {
  return withRetry(coachCancelledParentEmail(b.parentProfile.user.email, { ...bookingFacts(b), stripeOk }), {
    kind: "COACH_CANCELLED_PARENT",
    ref: b.id,
    params: { stripeOk },
  });
}

/** A new booking (regular, package or quick rebook): confirmation to the parent, heads-up to the coach. */
export function notifyBookingCreated(bookingId: string): void {
  later(async () => {
    const b = await loadBooking(bookingId);
    if (!b) return;
    await sendEmail(bookingConfirmedParentFor(b));
    await sendEmail(bookingNewCoachFor(b));
  });
}

export function notifyParentCancelled(bookingId: string, outcome: ParentCancelOutcome, stripeOk: boolean): void {
  later(async () => {
    const b = await loadBooking(bookingId);
    if (!b) return;
    await sendEmail(parentCancelledFor(b, "PARENT", outcome, stripeOk));
    await sendEmail(parentCancelledFor(b, "COACH", outcome, stripeOk));
  });
}

export function notifyCoachCancelled(bookingId: string, stripeOk: boolean): void {
  later(async () => {
    const b = await loadBooking(bookingId);
    if (!b) return;
    await sendEmail(coachCancelledParentFor(b, stripeOk));
  });
}

export type RefundNotice =
  | { kind: "REFUND"; bookingId: string; amountCents: number }
  | { kind: "LATE_CANCEL_WAIVER"; bookingId: string; amountCents: number; sessionsReturned: number }
  | { kind: "PACKAGE_UNUSED"; packageId: string; amountCents: number; sessions: number };

/** The refund email for a notice, or null if its booking or package is gone. */
export async function refundIssuedFor(r: RefundNotice): Promise<Email | null> {
  const { kind, amountCents } = r;
  if (r.kind === "PACKAGE_UNUSED") {
    const pkg = await prisma.sessionPackage.findUnique({
      where: { id: r.packageId },
      include: { parentProfile: { include: { user: true } }, coachProfile: { include: { user: true } } },
    });
    if (!pkg) return null;
    return withRetry(
      refundIssuedEmail(pkg.parentProfile.user.email, {
        kind: "PACKAGE_UNUSED",
        amountCents,
        sessions: r.sessions,
        coachName: pkg.coachProfile.user.name,
      }),
      { kind: "REFUND_ISSUED", ref: r.packageId, params: { kind, amountCents, sessions: r.sessions } },
    );
  }
  const b = await loadBooking(r.bookingId);
  if (!b) return null;
  const base = { coachName: b.coachProfile.user.name, scheduledAt: b.scheduledAt };
  return withRetry(
    refundIssuedEmail(
      b.parentProfile.user.email,
      r.kind === "REFUND"
        ? { kind: "REFUND", amountCents, ...base }
        : {
            kind: "LATE_CANCEL_WAIVER",
            amountCents,
            sessionsReturned: r.sessionsReturned,
            // waiveLateCancel returns referral credit spent on a non-package booking.
            creditReturnedCents: !b.packageId && b.discountCents > 0 ? b.discountCents : 0,
            ...base,
          },
    ),
    {
      kind: "REFUND_ISSUED",
      ref: r.bookingId,
      params: r.kind === "REFUND" ? { kind, amountCents } : { kind, amountCents, sessionsReturned: r.sessionsReturned },
    },
  );
}

/** Sent after an admin refund, waiver or unused-package refund has gone through. */
export function notifyRefundIssued(r: RefundNotice): void {
  later(async () => {
    const email = await refundIssuedFor(r);
    if (email) await sendEmail(email);
  });
}

// ---------------------------------------------------------------- messages

/**
 * A new message: email the other side, unless they've turned message emails off or were already
 * emailed about this conversation in the last hour. The claim on Thread.parentAlertedAt /
 * coachAlertedAt is a guarded update, so two messages sent at once can't both send an email.
 */
export function notifyNewMessage(threadId: string, senderUserId: string, now = new Date()): void {
  later(async () => {
    await sendNewMessageAlert(threadId, senderUserId, now);
  });
}

export async function sendNewMessageAlert(threadId: string, senderUserId: string, now = new Date()): Promise<"sent" | "off" | "throttled" | "none"> {
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    include: { parentProfile: { include: { user: true } }, coachProfile: { include: { user: true } } },
  });
  if (!thread) return "none";
  const senderIsParent = thread.parentProfile.userId === senderUserId;
  const sender = senderIsParent ? thread.parentProfile.user : thread.coachProfile.user;
  const recipient = senderIsParent ? thread.coachProfile.user : thread.parentProfile.user;
  if (!recipient.messageEmailAlerts) return "off";

  const field = senderIsParent ? "coachAlertedAt" : "parentAlertedAt";
  const cutoff = new Date(now.getTime() - MESSAGE_ALERT_INTERVAL_MS);
  const { count } = await prisma.thread.updateMany({
    where: { id: thread.id, OR: [{ [field]: null }, { [field]: { lte: cutoff } }] },
    data: { [field]: now },
  });
  if (count !== 1) return "throttled";

  await sendEmail(newMessageEmail({ to: recipient.email, senderName: sender.name, threadId: thread.id }));
  return "sent";
}

// ---------------------------------------------------------------- admin alerts

export async function emailAdmins(build: (to: string) => Email): Promise<void> {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true } });
  for (const a of admins) await sendEmail(build(a.email));
}

/**
 * Call after any change to a coach's own onboarding steps. Emails admins once, the first time the
 * coach is waiting for review (same rule as the dashboards: src/lib/coachReview.ts). Rejecting
 * the coach's ID clears reviewAlertSentAt, so a resubmission alerts again.
 */
export function notifyIfCoachAwaitingReview(coachUserId: string): void {
  later(() => sendCoachReviewAlert(coachUserId));
}

export async function sendCoachReviewAlert(coachUserId: string): Promise<"sent" | "not_waiting" | "already_sent"> {
  const status = await getCoachReviewStatus(coachUserId);
  if (!status?.awaitingReview) return "not_waiting";
  const { count } = await prisma.coachProfile.updateMany({
    where: { id: status.coachProfileId, reviewAlertSentAt: null },
    data: { reviewAlertSentAt: new Date() },
  });
  if (count !== 1) return "already_sent";
  const user = await prisma.user.findUnique({ where: { id: coachUserId }, select: { name: true } });
  await emailAdmins((to) => coachAwaitingReviewEmail({ to, coachName: user?.name ?? "A coach" }));
  return "sent";
}

export function notifyNewReport(targetType: "COACH_PROFILE" | "PARENT_PROFILE" | "MESSAGE"): void {
  later(() => emailAdmins((to) => newReportEmail({ to, targetType })));
}

export function notifyRefundRequest(kind: "PACKAGE_UNUSED" | "PROBLEM_REPORT" | "NO_SHOW"): void {
  later(() => emailAdmins((to) => refundRequestEmail({ to, kind })));
}
