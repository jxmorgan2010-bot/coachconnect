import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { bookingCreateSchema } from "@/lib/validation";
import { validateBookingRequest, BookingValidationError } from "@/lib/bookingValidation";
import { generateMockVideoCallUrl } from "@/lib/videoCall";
import { rangesOverlap } from "@/lib/bookingConflicts";
import { getStripe } from "@/lib/stripe";

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Only parent accounts can book sessions." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bookingCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const data = parsed.data;

  const parentProfile = await prisma.parentProfile.findUnique({ where: { userId: session.user.id } });
  if (!parentProfile) {
    return NextResponse.json({ error: "Parent profile not found." }, { status: 404 });
  }

  let validated;
  try {
    validated = await validateBookingRequest(parentProfile, data);
  } catch (err) {
    if (err instanceof BookingValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  const { child, coach, sport, breakdown, discountCents, totalDueCents, isFirstSession } = validated;

  // A card hold is required for anything above Stripe's practical minimum charge —
  // verify it was actually authorized for the right amount before creating the booking.
  let stripePaymentIntentId: string | null = null;
  let stripePaymentMethodId: string | null = null;
  if (totalDueCents >= 50) {
    if (!data.paymentIntentId) {
      return NextResponse.json({ error: "Payment authorization is required to book." }, { status: 400 });
    }
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(data.paymentIntentId);
    if (intent.metadata?.parentProfileId !== parentProfile.id) {
      return NextResponse.json({ error: "This payment authorization doesn't belong to you." }, { status: 403 });
    }
    if (intent.status !== "requires_capture") {
      return NextResponse.json({ error: "Your card wasn't authorized. Please re-enter your card details." }, { status: 400 });
    }
    if (intent.amount !== totalDueCents) {
      // Price moved between authorization and booking (e.g. referral credit changed) — cancel the stale
      // hold rather than book at the wrong amount.
      await stripe.paymentIntents.cancel(intent.id).catch(() => {});
      return NextResponse.json({ error: "The price changed — please try booking again." }, { status: 409 });
    }
    stripePaymentIntentId = intent.id;
    stripePaymentMethodId = typeof intent.payment_method === "string" ? intent.payment_method : (intent.payment_method?.id ?? null);
  }

  const booking = await prisma.$transaction(async (tx) => {
    // Re-check inside the transaction to close the race window between validation and this write.
    const stillActive = await tx.booking.findMany({
      where: { coachProfileId: coach.id, status: { in: ["CONFIRMED", "COMPLETED"] } },
      select: { scheduledAt: true, durationMinutes: true },
    });
    if (stillActive.some((b) => rangesOverlap(data.scheduledAt, data.durationMinutes, b.scheduledAt, b.durationMinutes))) {
      throw new Error("CONFLICT");
    }

    const created = await tx.booking.create({
      data: {
        parentProfileId: parentProfile.id,
        coachProfileId: coach.id,
        childId: child.id,
        sport,
        scheduledAt: data.scheduledAt,
        durationMinutes: data.durationMinutes,
        locationText: data.locationText,
        priceCents: breakdown.sessionCostCents,
        platformFeeCents: breakdown.platformFeeCents,
        discountCents,
        status: "CONFIRMED",
        parentalConsent: true,
        stripePaymentIntentId,
        stripePaymentMethodId,
      },
    });

    let videoCallUrl: string | null = null;
    if (isFirstSession) {
      videoCallUrl = generateMockVideoCallUrl(created.id);
      await tx.booking.update({ where: { id: created.id }, data: { videoCallUrl } });
    }

    if (discountCents > 0) {
      await tx.parentProfile.update({
        where: { id: parentProfile.id },
        data: { creditCents: { decrement: discountCents } },
      });
    }

    return { ...created, videoCallUrl };
  }).catch((err) => {
    if (err instanceof Error && err.message === "CONFLICT") return null;
    throw err;
  });

  if (!booking) {
    if (stripePaymentIntentId) {
      await getStripe().paymentIntents.cancel(stripePaymentIntentId).catch(() => {});
    }
    return NextResponse.json({ error: "That time was just booked by someone else. Pick another time." }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    bookingId: booking.id,
    isFirstSession,
    videoCallUrl: booking.videoCallUrl,
  });
}
