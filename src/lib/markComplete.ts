import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { captureHeldPayment } from "@/lib/payment";
import { bookingChargeCents } from "@/lib/cancellation";
import { claimable } from "@/lib/cardHolds";
import { awardPoints, POINTS_QUICK_REBOOK, POINTS_SESSION_COMPLETED } from "@/lib/points";
import { settleReferralAfterCompletion } from "@/lib/referral";

type CompletableBooking = Prisma.BookingGetPayload<{ include: { parentProfile: true } }>;

export type MarkCompleteResult =
  | { status: "COMPLETED"; booking: Prisma.BookingGetPayload<object> }
  // An auto-release run, or the parent's own other request, is working on this booking.
  | { status: "BUSY" }
  | { status: "CHARGE_FAILED" }
  | { status: "ALREADY_COMPLETE" };

/**
 * The parent's "Mark complete": charges the session and completes the booking, awarding points.
 * The caller has already checked who's asking and that the session has ended.
 *
 * The booking is claimed before Stripe is called, with the same holdClaimedAt claim as the
 * auto-release job (src/lib/autoRelease.ts), so only one of them reaches Stripe for it. A failed
 * charge frees the claim straight away so the parent can try again. A request that dies mid-way
 * leaves the claim to expire, and the Stripe idempotency key means the retry can't charge twice.
 */
export async function markSessionComplete(booking: CompletableBooking): Promise<MarkCompleteResult> {
  const { id } = booking;
  const claim = await prisma.booking.updateMany({
    where: { id, status: "CONFIRMED", OR: claimable(new Date()) },
    data: { holdClaimedAt: new Date() },
  });
  if (claim.count !== 1) return { status: "BUSY" };

  let paymentIntentId: string | null;
  try {
    paymentIntentId = await captureHeldPayment({
      bookingId: id,
      stripePaymentIntentId: booking.stripePaymentIntentId,
      stripeCustomerId: booking.parentProfile.stripeCustomerId,
      stripePaymentMethodId: booking.stripePaymentMethodId,
      amountCents: bookingChargeCents(booking),
    });
  } catch (err) {
    console.error("Stripe capture failed", err);
    await prisma.booking.update({ where: { id }, data: { holdClaimedAt: null } });
    return { status: "CHARGE_FAILED" };
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    // Still guarded on CONFIRMED, in case the booking changed after an expired claim: completes
    // nothing and awards no points a second time.
    const { count } = await tx.booking.updateMany({
      where: { id, status: "CONFIRMED" },
      data: {
        status: "COMPLETED",
        completedAt: now,
        paymentStatus: "CAPTURED",
        capturedAt: now,
        stripePaymentIntentId: paymentIntentId,
        holdClaimedAt: null,
      },
    });
    if (count !== 1) return null;
    await awardPoints(tx, { parentProfileId: booking.parentProfileId, action: "SESSION_COMPLETED", points: POINTS_SESSION_COMPLETED, bookingId: id });
    await awardPoints(tx, { coachProfileId: booking.coachProfileId, action: "SESSION_COMPLETED", points: POINTS_SESSION_COMPLETED, bookingId: id });
    // A quick-rebooked session earns its rebook points only once it actually happened.
    if (booking.bookedViaQuickRebook) {
      await awardPoints(tx, { parentProfileId: booking.parentProfileId, action: "QUICK_REBOOK", points: POINTS_QUICK_REBOOK, bookingId: id });
    }
    return tx.booking.findUniqueOrThrow({ where: { id } });
  });
  if (!updated) return { status: "ALREADY_COMPLETE" };

  await settleReferralAfterCompletion(id);
  return { status: "COMPLETED", booking: updated };
}
