import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { captureHeldPayment } from "@/lib/payment";
import { bookingChargeCents } from "@/lib/cancellation";
import { awardPoints, POINTS_QUICK_REBOOK, POINTS_SESSION_COMPLETED } from "@/lib/points";
import { canMarkComplete, formatPacificTime, sessionEndsAt } from "@/lib/sessionTiming";
import { settleReferralAfterCompletion } from "@/lib/referral";

/**
 * Only the parent can mark a session complete — this is what releases the
 * held payment to the coach. Keeping this parent-only (not the coach) means
 * a coach can't force a payout by marking their own session done.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const booking = await prisma.booking.findUnique({ where: { id }, include: { parentProfile: true } });
  if (!booking || booking.parentProfile.userId !== session.user.id) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  if (booking.status !== "CONFIRMED") {
    return NextResponse.json({ error: "Only confirmed sessions can be marked complete." }, { status: 400 });
  }
  if (!canMarkComplete(booking)) {
    return NextResponse.json(
      { error: `You can mark this session complete after it ends, at ${formatPacificTime(sessionEndsAt(booking))}.` },
      { status: 400 },
    );
  }

  let paymentIntentId: string | null;
  try {
    paymentIntentId = await captureHeldPayment({
      stripePaymentIntentId: booking.stripePaymentIntentId,
      stripeCustomerId: booking.parentProfile.stripeCustomerId,
      stripePaymentMethodId: booking.stripePaymentMethodId,
      amountCents: bookingChargeCents(booking),
    });
  } catch (err) {
    console.error("Stripe capture failed", err);
    return NextResponse.json({ error: "We couldn't charge the card on file. Please try again or contact support." }, { status: 502 });
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    // Guarded on CONFIRMED: a repeated or concurrent request (whose capture finds the payment
    // already taken) completes nothing and awards no points a second time.
    const { count } = await tx.booking.updateMany({
      where: { id, status: "CONFIRMED" },
      data: { status: "COMPLETED", completedAt: now, paymentStatus: "CAPTURED", capturedAt: now, stripePaymentIntentId: paymentIntentId },
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
  if (!updated) {
    return NextResponse.json({ error: "This session was already marked complete." }, { status: 409 });
  }

  await settleReferralAfterCompletion(id);

  return NextResponse.json({ ok: true, booking: updated });
}
