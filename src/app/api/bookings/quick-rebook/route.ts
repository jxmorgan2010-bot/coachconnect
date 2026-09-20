import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { quickRebookSchema } from "@/lib/validation";
import { validateBookingRequest, createConfirmedBooking, BookingValidationError } from "@/lib/bookingValidation";
import { nextOccurrenceOf } from "@/lib/rebook";
import { chargeOffSessionHold, cancelPaymentIntent } from "@/lib/payment";
import { awardPoints, POINTS_QUICK_REBOOK } from "@/lib/points";

/**
 * One-click "book this coach again" — same coach, child, sport, duration, and location
 * as a prior booking, at the next occurrence of the same weekday/time. Charges the card
 * on file off-session (no Stripe Elements on this screen) using the payment method saved
 * from that prior booking, which is why bookings are created with
 * setup_future_usage: "off_session" in the first place.
 */
export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Only parent accounts can rebook." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = quickRebookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const parentProfile = await prisma.parentProfile.findUnique({ where: { userId: session.user.id } });
  if (!parentProfile) {
    return NextResponse.json({ error: "Parent profile not found." }, { status: 404 });
  }

  const priorBooking = await prisma.booking.findUnique({ where: { id: parsed.data.bookingId } });
  if (!priorBooking || priorBooking.parentProfileId !== parentProfile.id) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  if (!priorBooking.childId) {
    return NextResponse.json({ error: "That session has no child on file to rebook for." }, { status: 400 });
  }

  const scheduledAt = nextOccurrenceOf(priorBooking.scheduledAt);

  let validated;
  try {
    validated = await validateBookingRequest(parentProfile, {
      coachProfileId: priorBooking.coachProfileId,
      childId: priorBooking.childId,
      sport: priorBooking.sport,
      scheduledAt,
      durationMinutes: priorBooking.durationMinutes,
      locationText: priorBooking.locationText,
      secondAdultName: priorBooking.secondAdultName ?? undefined,
    });
  } catch (err) {
    if (err instanceof BookingValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  const { coach, sport, breakdown, discountCents, totalDueCents, isFirstSession } = validated;

  let stripePaymentIntentId: string | null = null;
  let stripePaymentMethodId: string | null = null;
  if (totalDueCents >= 50) {
    if (!parentProfile.stripeCustomerId || !priorBooking.stripePaymentMethodId) {
      return NextResponse.json({ error: "No saved card on file — use the regular booking form instead." }, { status: 400 });
    }
    try {
      const intent = await chargeOffSessionHold(parentProfile.stripeCustomerId, priorBooking.stripePaymentMethodId, totalDueCents);
      stripePaymentIntentId = intent.id;
      stripePaymentMethodId = priorBooking.stripePaymentMethodId;
    } catch (err) {
      const stripeErr = err as { code?: string; message?: string };
      if (stripeErr.code === "authentication_required") {
        return NextResponse.json(
          { error: "Your card needs to be re-verified — please use the regular booking form to continue." },
          { status: 400 },
        );
      }
      console.error("Off-session quick-rebook charge failed", err);
      return NextResponse.json({ error: "We couldn't charge the card on file. Please use the regular booking form." }, { status: 502 });
    }
  }

  const booking = await createConfirmedBooking({
    parentProfileId: parentProfile.id,
    coachProfileId: coach.id,
    childId: priorBooking.childId,
    sport,
    scheduledAt,
    durationMinutes: priorBooking.durationMinutes,
    locationText: priorBooking.locationText,
    secondAdultName: priorBooking.secondAdultName,
    priceCents: breakdown.sessionCostCents,
    platformFeeCents: breakdown.platformFeeCents,
    discountCents,
    isFirstSession,
    stripePaymentIntentId,
    stripePaymentMethodId,
  });

  if (!booking) {
    if (stripePaymentIntentId) {
      await cancelPaymentIntent(stripePaymentIntentId);
    }
    return NextResponse.json({ error: "That time was just booked by someone else. Try the regular booking form." }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    await awardPoints(tx, { parentProfileId: parentProfile.id, action: "QUICK_REBOOK", points: POINTS_QUICK_REBOOK, bookingId: booking.id });
  });

  return NextResponse.json({ ok: true, bookingId: booking.id, scheduledAt: booking.scheduledAt });
}
