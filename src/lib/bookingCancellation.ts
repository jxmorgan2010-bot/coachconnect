import { prisma } from "@/lib/prisma";
import { notifyCoachCancelled, notifyParentCancelled } from "@/lib/notify";
import { cancelPaymentIntent, captureHeldPayment, STRIPE_MIN_CENTS } from "@/lib/payment";
import { formatCents } from "@/lib/money";
import {
  bookingChargeCents,
  canCoachCancel,
  canParentCancel,
  parentCancelOutcome,
  type ParentCancelOutcome,
} from "@/lib/cancellation";
import type { Booking, CancelledBy, CoachProfile, ParentProfile, User } from "@/generated/prisma/client";

/**
 * Parent and coach cancellations under the policy in src/lib/cancellation.ts.
 *
 * Same order as the platform cancellations in src/lib/minorConsent.ts: the booking is
 * claimed first (a guarded update, so a cancel can't race a completion or a no-show
 * report), then Stripe is called. If Stripe fails, the booking stays CANCELLED with
 * paymentStatus AUTHORIZED, which /admin/refunds lists for follow-up.
 */

type BookingWithPeople = Booking & {
  parentProfile: ParentProfile & { user: User };
  coachProfile: CoachProfile & { user: User };
};

export type CancelResult =
  | { ok: true; outcome: ParentCancelOutcome | "COACH"; stripeOk: boolean }
  | { ok: false; status: number; error: string; code?: "OUTCOME_CHANGED"; outcome?: ParentCancelOutcome };

const RACED: CancelResult = { ok: false, status: 409, error: "This session was just updated. Refresh to see where it stands." };

function loadBooking(id: string) {
  return prisma.booking.findUnique({
    where: { id },
    include: { parentProfile: { include: { user: true } }, coachProfile: { include: { user: true } } },
  });
}

/**
 * `expected` is the outcome the parent was shown when they confirmed. If the free-cancel
 * deadline passed while the dialog was open, nothing happens and the parent is asked again,
 * so no one is charged on terms they didn't see.
 */
export async function cancelByParent({
  bookingId,
  parentUserId,
  expected,
  now = new Date(),
}: {
  bookingId: string;
  parentUserId: string;
  expected: ParentCancelOutcome;
  now?: Date;
}): Promise<CancelResult> {
  const b = await loadBooking(bookingId);
  if (!b || b.parentProfile.userId !== parentUserId) return { ok: false, status: 404, error: "Booking not found." };
  if (b.status !== "CONFIRMED") return { ok: false, status: 400, error: "This session can't be cancelled anymore." };
  if (!canParentCancel(b, now)) {
    return {
      ok: false,
      status: 400,
      error: "This session has already started, so it can't be cancelled. If the coach didn't show, you can report it from 15 minutes after the start.",
    };
  }

  const outcome = parentCancelOutcome(b.scheduledAt, now);
  if (outcome !== expected) {
    return {
      ok: false,
      status: 409,
      code: "OUTCOME_CHANGED",
      outcome,
      error:
        outcome === "LATE"
          ? "It's now past the free-cancellation deadline. Review what cancelling means now and confirm again."
          : "Cancelling is free again. Review and confirm again.",
    };
  }

  const result = outcome === "FREE" ? await releaseBooking(b, "PARENT", now) : await lateCancel(b, now);
  if (!result.ok) return result;

  notifyParentCancelled(b.id, outcome, result.stripeOk);
  return { ok: true, outcome, stripeOk: result.stripeOk };
}

export async function cancelByCoach({
  bookingId,
  coachUserId,
  now = new Date(),
}: {
  bookingId: string;
  coachUserId: string;
  now?: Date;
}): Promise<CancelResult> {
  const b = await loadBooking(bookingId);
  if (!b || b.coachProfile.userId !== coachUserId) return { ok: false, status: 404, error: "Booking not found." };
  if (b.status !== "CONFIRMED") return { ok: false, status: 400, error: "This session can't be cancelled anymore." };
  if (!canCoachCancel(b, now)) return { ok: false, status: 400, error: "This session has already ended, so it can't be cancelled." };

  const result = await releaseBooking(b, "COACH", now);
  if (!result.ok) return result;

  notifyCoachCancelled(b.id, result.stripeOk);
  return { ok: true, outcome: "COACH", stripeOk: result.stripeOk };
}

/**
 * A free parent cancel or any coach cancel: the parent pays nothing. The card hold is
 * released, a package session goes back into the package, and referral credit used on
 * the booking goes back to the parent.
 */
async function releaseBooking(
  b: BookingWithPeople,
  by: CancelledBy,
  now: Date,
): Promise<{ ok: true; stripeOk: boolean } | CancelResult> {
  const claimed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.booking.updateMany({
      where: { id: b.id, status: "CONFIRMED" },
      data: { status: "CANCELLED", cancelledAt: now, cancelledBy: by },
    });
    if (count !== 1) return null;
    // Read after the claim: the card-holds job only saves a hold on a CONFIRMED booking, so
    // whether there's a hold to release is settled now.
    const { stripePaymentIntentId } = await tx.booking.findUniqueOrThrow({ where: { id: b.id }, select: { stripePaymentIntentId: true } });
    const holdId = b.packageId ? null : stripePaymentIntentId;
    // A package session's value goes back into the package; a booking with no card hold (none
    // needed, or not placed yet) is settled right here. A hold is marked CANCELLED once Stripe
    // confirms below.
    if (b.packageId || !holdId) {
      await tx.booking.update({ where: { id: b.id }, data: { paymentStatus: b.packageId ? "REFUNDED" : "CANCELLED" } });
    }
    if (b.packageId) {
      await tx.sessionPackage.update({
        where: { id: b.packageId },
        data: { sessionsUsed: { decrement: 1 }, sessionsRefunded: { increment: 1 }, status: "ACTIVE" },
      });
    } else if (b.discountCents > 0) {
      await tx.parentProfile.update({ where: { id: b.parentProfileId }, data: { creditCents: { increment: b.discountCents } } });
    }
    return { holdId };
  });
  if (!claimed) return RACED;

  if (!claimed.holdId) return { ok: true, stripeOk: true };
  try {
    await cancelPaymentIntent(claimed.holdId);
    await prisma.booking.update({ where: { id: b.id }, data: { paymentStatus: "CANCELLED" } });
    return { ok: true, stripeOk: true };
  } catch (err) {
    console.error(`Couldn't release the card hold for cancelled booking ${b.id}`, err);
    return { ok: true, stripeOk: false };
  }
}

/**
 * A parent cancel after the deadline: charged the full price, coach paid as if the session
 * happened. A package session simply stays used. Credit applied at booking stays spent. With no
 * live hold (it expired, or the scheduled hold failed and wasn't fixed), the card saved at
 * booking is charged instead (captureHeldPayment).
 */
async function lateCancel(b: BookingWithPeople, now: Date): Promise<{ ok: true; stripeOk: boolean } | CancelResult> {
  const amountCents = bookingChargeCents(b);
  const claimed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.booking.updateMany({
      where: { id: b.id, status: "CONFIRMED" },
      data: { status: "CANCELLED", cancelledAt: now, cancelledBy: "PARENT", lateCancellation: true },
    });
    if (count !== 1) return null;
    // Read after the claim, as in releaseBooking: a scheduled hold can't be saved after this.
    const fresh = await tx.booking.findUniqueOrThrow({
      where: { id: b.id },
      select: { stripePaymentIntentId: true, stripePaymentMethodId: true },
    });
    const chargesCard =
      !b.packageId && (!!fresh.stripePaymentIntentId || (!!fresh.stripePaymentMethodId && amountCents >= STRIPE_MIN_CENTS));
    // Covered entirely by referral credit: nothing to capture, the credit is the payment.
    if (!b.packageId && !chargesCard) {
      await tx.booking.update({ where: { id: b.id }, data: { paymentStatus: "CAPTURED", capturedAt: now } });
    }
    return { chargesCard, ...fresh };
  });
  if (!claimed) return RACED;

  if (!claimed.chargesCard) return { ok: true, stripeOk: true };
  try {
    const paymentIntentId = await captureHeldPayment({
      bookingId: b.id,
      stripePaymentIntentId: claimed.stripePaymentIntentId,
      stripeCustomerId: b.parentProfile.stripeCustomerId,
      stripePaymentMethodId: claimed.stripePaymentMethodId,
      amountCents,
      label: "late cancellation",
    });
    await prisma.booking.update({
      where: { id: b.id },
      data: { paymentStatus: "CAPTURED", capturedAt: now, stripePaymentIntentId: paymentIntentId },
    });
    return { ok: true, stripeOk: true };
  } catch (err) {
    console.error(`Late-cancel charge of ${formatCents(amountCents)} failed for booking ${b.id}`, err);
    return { ok: true, stripeOk: false };
  }
}
