import { prisma } from "@/lib/prisma";
import { RETRY_KINDS, sendEmail, withRetry, type Email, type RetryKind } from "@/lib/email";
import {
  autoReleasedCoachEmail,
  autoReleasedParentEmail,
  holdFailedParentEmail,
  holdNotFixedCoachEmail,
  holdNotFixedParentEmail,
  noShowCoachEmail,
  noShowParentEmail,
  passwordResetEmail,
  reminderEmail,
} from "@/lib/emails";
import {
  bookingConfirmedParentFor,
  bookingNewCoachFor,
  coachCancelledParentFor,
  loadBooking,
  parentCancelledFor,
  refundIssuedFor,
  type LoadedBooking,
} from "@/lib/notify";
import { discardResetToken, issueResetLinkForRetry, resetLink } from "@/lib/passwordReset";
import { bookingChargeCents } from "@/lib/cancellation";
import { HOLD_NOT_FIXED_REASON, holdFixDeadline } from "@/lib/holdTiming";

/**
 * Resending an email that never went out, from "Email problems" on /admin/jobs.
 *
 * The email isn't stored (links can carry one-time tokens), so it's rebuilt from the database as
 * it is now, with the same templates and builders the original used. Each kind first checks the
 * email is still right to send: no "booking confirmed" for a booking that's since been cancelled,
 * no reminder for a session that's started, no "update your card" once the card is fixed or the
 * deadline has passed. A password reset gets a new link.
 *
 * A retry is claimed for RETRY_CLAIM_MS, so two clicks (or two admins) can't send it twice. If
 * Resend actually delivered the original but the connection dropped before it answered, a retry
 * can duplicate it; the admin page says so.
 */

export const RETRY_CLAIM_MS = 60 * 1000;
const HOUR = 60 * 60 * 1000;

export type RetryOutcome = { ok: true } | { ok: false; error: string };

type Params = Record<string, string | number | boolean>;
type Built = { email: Email; onFail?: () => Promise<void> } | { refused: string };

export function isRetryKind(value: string | null): value is RetryKind {
  return value !== null && (RETRY_KINDS as readonly string[]).includes(value);
}

/** Plain words for the admin page. */
export const RETRY_KIND_LABELS: Record<RetryKind, string> = {
  PASSWORD_RESET: "Password reset",
  BOOKING_CONFIRMED_PARENT: "Booking confirmed (parent)",
  BOOKING_NEW_COACH: "New booking (coach)",
  PARENT_CANCELLED_PARENT: "Parent cancelled (parent)",
  PARENT_CANCELLED_COACH: "Parent cancelled (coach)",
  COACH_CANCELLED_PARENT: "Coach cancelled (parent)",
  REFUND_ISSUED: "Refund issued (parent)",
  REMINDER_PARENT: "Session reminder (parent)",
  REMINDER_COACH: "Session reminder (coach)",
  HOLD_FAILED_PARENT: "Card problem: update your card (parent)",
  HOLD_NOT_FIXED_PARENT: "Cancelled, card not updated (parent)",
  HOLD_NOT_FIXED_COACH: "Cancelled, card not updated (coach)",
  NO_SHOW_PARENT: "No-show reported (parent)",
  NO_SHOW_COACH: "No-show reported (coach)",
  AUTO_RELEASED_PARENT: "Auto-completed (parent)",
  AUTO_RELEASED_COACH: "Auto-completed (coach)",
};

function parseParams(raw: string | null): Params {
  try {
    const value = raw ? JSON.parse(raw) : {};
    return value && typeof value === "object" ? (value as Params) : {};
  } catch {
    return {};
  }
}

const statusWord = (b: LoadedBooking) => b.status.toLowerCase();

/** The email to resend now, or why it shouldn't be. Exported for tests. */
export async function rebuildEmail(kind: RetryKind, ref: string, params: Params, failedAt: Date, now: Date): Promise<Built> {
  if (kind === "PASSWORD_RESET") {
    const issued = await issueResetLinkForRetry(ref, failedAt, now);
    if (!issued.ok) return { refused: issued.reason };
    return {
      email: withRetry(passwordResetEmail({ to: issued.user.email, name: issued.user.name, link: resetLink(issued.token) }), { kind, ref }),
      onFail: () => discardResetToken(issued.token),
    };
  }

  if (kind === "REFUND_ISSUED") {
    const amountCents = Number(params.amountCents);
    const email =
      params.kind === "PACKAGE_UNUSED"
        ? await refundIssuedFor({ kind: "PACKAGE_UNUSED", packageId: ref, amountCents, sessions: Number(params.sessions) })
        : params.kind === "LATE_CANCEL_WAIVER"
          ? await refundIssuedFor({ kind: "LATE_CANCEL_WAIVER", bookingId: ref, amountCents, sessionsReturned: Number(params.sessionsReturned) })
          : await refundIssuedFor({ kind: "REFUND", bookingId: ref, amountCents });
    return email ? { email } : { refused: "That booking or package no longer exists." };
  }

  const b = await loadBooking(ref);
  if (!b) return { refused: "That booking no longer exists." };
  const started = b.scheduledAt.getTime() <= now.getTime();

  switch (kind) {
    case "BOOKING_CONFIRMED_PARENT":
    case "BOOKING_NEW_COACH":
      if (b.status !== "CONFIRMED") return { refused: `The booking is now ${statusWord(b)}, so a confirmation would be wrong.` };
      if (started) return { refused: "The session has already started." };
      return { email: kind === "BOOKING_CONFIRMED_PARENT" ? bookingConfirmedParentFor(b) : bookingNewCoachFor(b) };

    case "PARENT_CANCELLED_PARENT":
    case "PARENT_CANCELLED_COACH":
      if (b.status !== "CANCELLED") return { refused: `The booking is now ${statusWord(b)}, not cancelled.` };
      return {
        email: parentCancelledFor(b, kind === "PARENT_CANCELLED_PARENT" ? "PARENT" : "COACH", params.outcome === "LATE" ? "LATE" : "FREE", params.stripeOk !== false),
      };

    case "COACH_CANCELLED_PARENT":
      if (b.status !== "CANCELLED") return { refused: `The booking is now ${statusWord(b)}, not cancelled.` };
      return { email: coachCancelledParentFor(b, params.stripeOk !== false) };

    case "REMINDER_PARENT":
    case "REMINDER_COACH": {
      if (b.status !== "CONFIRMED") return { refused: `The booking is now ${statusWord(b)}.` };
      if (started) return { refused: "The session has already started." };
      const reminderKind = params.kind === "SOON" ? "SOON" : "TOMORROW";
      // The 24-hour reminder's subject says "tomorrow"; closer in, the 1-hour reminder covers it.
      if (reminderKind === "TOMORROW" && b.scheduledAt.getTime() - now.getTime() < 12 * HOUR) {
        return { refused: "The session is less than 12 hours away, so the 24-hour reminder would be wrong. The 1-hour reminder still goes out." };
      }
      const audience = kind === "REMINDER_PARENT" ? "PARENT" : "COACH";
      return {
        email: withRetry(
          reminderEmail({
            to: audience === "PARENT" ? b.parentProfile.user.email : b.coachProfile.user.email,
            audience,
            kind: reminderKind,
            coachName: b.coachProfile.user.name,
            parentName: b.parentProfile.user.name,
            childFirstName: b.child?.firstName ?? null,
            scheduledAt: b.scheduledAt,
            locationText: b.locationText,
          }),
          { kind, ref, params: { kind: reminderKind } },
        ),
      };
    }

    case "HOLD_FAILED_PARENT": {
      const fixBy = holdFixDeadline(b.scheduledAt);
      if (b.status !== "CONFIRMED") return { refused: `The booking is now ${statusWord(b)}.` };
      if (b.stripePaymentIntentId || !b.holdFailedAt) return { refused: "The card has been fixed: the hold is in place." };
      if (now.getTime() >= fixBy.getTime()) return { refused: "The deadline to update the card has passed." };
      return {
        email: withRetry(
          holdFailedParentEmail({
            to: b.parentProfile.user.email,
            bookingId: b.id,
            coachName: b.coachProfile.user.name,
            childFirstName: b.child?.firstName ?? null,
            scheduledAt: b.scheduledAt,
            amountCents: bookingChargeCents(b),
            fixBy,
            needsAuthentication: b.holdFailureCode === "authentication_required",
          }),
          { kind, ref },
        ),
      };
    }

    case "HOLD_NOT_FIXED_PARENT":
    case "HOLD_NOT_FIXED_COACH":
      if (b.status !== "CANCELLED" || b.cancelReason !== HOLD_NOT_FIXED_REASON) {
        return { refused: "This booking wasn't cancelled for an unfixed card." };
      }
      return {
        email:
          kind === "HOLD_NOT_FIXED_PARENT"
            ? withRetry(
                holdNotFixedParentEmail({
                  to: b.parentProfile.user.email,
                  coachName: b.coachProfile.user.name,
                  childFirstName: b.child?.firstName ?? null,
                  scheduledAt: b.scheduledAt,
                  amountCents: bookingChargeCents(b),
                  creditReturnedCents: b.discountCents,
                }),
                { kind, ref },
              )
            : withRetry(holdNotFixedCoachEmail({ to: b.coachProfile.user.email, scheduledAt: b.scheduledAt }), { kind, ref }),
      };

    case "NO_SHOW_PARENT":
    case "NO_SHOW_COACH":
      if (b.status !== "CANCELLED") return { refused: `The booking is now ${statusWord(b)}.` };
      return {
        email:
          kind === "NO_SHOW_PARENT"
            ? withRetry(noShowParentEmail({ to: b.parentProfile.user.email, coachName: b.coachProfile.user.name }), { kind, ref })
            : withRetry(noShowCoachEmail({ to: b.coachProfile.user.email, scheduledAt: b.scheduledAt }), { kind, ref }),
      };

    case "AUTO_RELEASED_PARENT":
    case "AUTO_RELEASED_COACH":
      if (b.status !== "COMPLETED") return { refused: `The booking is now ${statusWord(b)}, not completed.` };
      return {
        email:
          kind === "AUTO_RELEASED_PARENT"
            ? withRetry(autoReleasedParentEmail({ to: b.parentProfile.user.email, coachName: b.coachProfile.user.name }), { kind, ref })
            : withRetry(autoReleasedCoachEmail({ to: b.coachProfile.user.email, scheduledAt: b.scheduledAt }), { kind, ref }),
      };
  }
}

/** Resends one failed email. On success the row is marked RESENT; otherwise it keeps the new error. */
export async function retryEmailFailure(id: string, adminUserId: string, now = new Date()): Promise<RetryOutcome> {
  const row = await prisma.emailSendFailure.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Not found." };
  if (row.resolvedAt) return { ok: false, error: "This one is already resolved." };
  if (!isRetryKind(row.retryKind) || !row.retryRef) return { ok: false, error: "This email can't be resent from here." };

  const { count } = await prisma.emailSendFailure.updateMany({
    where: {
      id,
      resolvedAt: null,
      OR: [{ lastRetryAt: null }, { lastRetryAt: { lt: new Date(now.getTime() - RETRY_CLAIM_MS) } }],
    },
    data: { lastRetryAt: now, retryCount: { increment: 1 } },
  });
  if (count !== 1) return { ok: false, error: "It was just retried. Wait a minute and try again." };

  const fail = async (error: string): Promise<RetryOutcome> => {
    await prisma.emailSendFailure.update({ where: { id }, data: { lastRetryError: error.slice(0, 200) } });
    return { ok: false, error };
  };

  let built: Built;
  try {
    built = await rebuildEmail(row.retryKind, row.retryRef, parseParams(row.retryParams), row.createdAt, now);
  } catch (err) {
    console.error(`[email retry] couldn't rebuild ${row.retryKind}: ${(err as Error)?.message ?? err}`);
    return fail("Couldn't rebuild the email. Try again, or mark it reviewed.");
  }
  if ("refused" in built) return fail(`Not resent: ${built.refused}`);

  const result = await sendEmail(built.email, { record: false });
  if (result.status === "sent" || result.status === "logged") {
    await prisma.emailSendFailure.update({
      where: { id },
      data: { resolution: "RESENT", resolvedAt: new Date(), resolvedById: adminUserId, lastRetryError: null },
    });
    return { ok: true };
  }
  await built.onFail?.();
  return fail(
    result.status === "failed"
      ? `Still not sent: ${result.reason}`
      : "Not sent: outside production only @resend.dev addresses get email.",
  );
}
