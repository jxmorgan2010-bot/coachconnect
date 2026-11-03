import { prisma } from "@/lib/prisma";
import { later, sendEmail, type Email } from "@/lib/email";
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
} from "@/lib/emails";
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

async function loadBooking(bookingId: string) {
  return prisma.booking.findUnique({ where: { id: bookingId }, include: bookingInclude });
}
type LoadedBooking = NonNullable<Awaited<ReturnType<typeof loadBooking>>>;

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

/** A new booking (regular, package or quick rebook): confirmation to the parent, heads-up to the coach. */
export function notifyBookingCreated(bookingId: string): void {
  later(async () => {
    const b = await loadBooking(bookingId);
    if (!b) return;
    const facts = bookingFacts(b);
    await sendEmail(bookingConfirmedParentEmail(b.parentProfile.user.email, facts));
    await sendEmail(bookingNewCoachEmail(b.coachProfile.user.email, facts));
  });
}

export function notifyParentCancelled(bookingId: string, outcome: ParentCancelOutcome, stripeOk: boolean): void {
  later(async () => {
    const b = await loadBooking(bookingId);
    if (!b) return;
    const facts = { ...bookingFacts(b), outcome, stripeOk };
    await sendEmail(parentCancelledParentEmail(b.parentProfile.user.email, facts));
    await sendEmail(parentCancelledCoachEmail(b.coachProfile.user.email, facts));
  });
}

export function notifyCoachCancelled(bookingId: string, stripeOk: boolean): void {
  later(async () => {
    const b = await loadBooking(bookingId);
    if (!b) return;
    await sendEmail(coachCancelledParentEmail(b.parentProfile.user.email, { ...bookingFacts(b), stripeOk }));
  });
}

export type RefundNotice =
  | { kind: "REFUND"; bookingId: string; amountCents: number }
  | { kind: "LATE_CANCEL_WAIVER"; bookingId: string; amountCents: number; sessionsReturned: number }
  | { kind: "PACKAGE_UNUSED"; packageId: string; amountCents: number; sessions: number };

/** Sent after an admin refund, waiver or unused-package refund has gone through. */
export function notifyRefundIssued(r: RefundNotice): void {
  later(async () => {
    if (r.kind === "PACKAGE_UNUSED") {
      const pkg = await prisma.sessionPackage.findUnique({
        where: { id: r.packageId },
        include: { parentProfile: { include: { user: true } }, coachProfile: { include: { user: true } } },
      });
      if (!pkg) return;
      await sendEmail(
        refundIssuedEmail(pkg.parentProfile.user.email, {
          kind: "PACKAGE_UNUSED",
          amountCents: r.amountCents,
          sessions: r.sessions,
          coachName: pkg.coachProfile.user.name,
        }),
      );
      return;
    }
    const b = await loadBooking(r.bookingId);
    if (!b) return;
    const base = { coachName: b.coachProfile.user.name, scheduledAt: b.scheduledAt };
    await sendEmail(
      refundIssuedEmail(
        b.parentProfile.user.email,
        r.kind === "REFUND"
          ? { kind: "REFUND", amountCents: r.amountCents, ...base }
          : {
              kind: "LATE_CANCEL_WAIVER",
              amountCents: r.amountCents,
              sessionsReturned: r.sessionsReturned,
              // waiveLateCancel returns referral credit spent on a non-package booking.
              creditReturnedCents: !b.packageId && b.discountCents > 0 ? b.discountCents : 0,
              ...base,
            },
      ),
    );
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
