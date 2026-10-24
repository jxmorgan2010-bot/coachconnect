import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { quickRebookSchema } from "@/lib/validation";
import {
  validateBookingRequest,
  createConfirmedBooking,
  BookingValidationError,
  SECOND_ADULT_REQUIRED_MESSAGE,
} from "@/lib/bookingValidation";
import { nextOccurrences } from "@/lib/rebook";
import { chargeOffSessionHold, cancelPaymentIntent } from "@/lib/payment";
import { rangesOverlap } from "@/lib/bookingConflicts";
import { SLOT_HOLDING_STATUS_FILTER } from "@/lib/availability";

// How many weeks ahead quick rebook looks for a week the parent doesn't already have booked.
const REBOOK_WEEKS_TO_TRY = 4;
import { isAllowedLength, lengthLabel, lengthOptions, LENGTH_NOT_ALLOWED_MESSAGE } from "@/lib/sessionLengths";

/**
 * One-click "book this coach again" — same coach, child, sport, duration, and location
 * as a prior booking, at the next occurrence of the same weekday/time. (If the prior
 * length can no longer be booked, the parent is asked to pick a current one.) Charges the card
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

  // Same length as last time, unless that length can no longer be booked: then the parent
  // picks one of the current lengths (the button shows them with prices and retries).
  const durationMinutes = parsed.data.durationMinutes ?? priorBooking.durationMinutes;
  if (!isAllowedLength(durationMinutes)) {
    if (parsed.data.durationMinutes !== undefined) {
      return NextResponse.json({ error: LENGTH_NOT_ALLOWED_MESSAGE, code: "LENGTH_NOT_ALLOWED" }, { status: 400 });
    }
    const coach = await prisma.coachProfile.findUnique({ where: { id: priorBooking.coachProfileId }, select: { hourlyRateCents: true } });
    return NextResponse.json(
      {
        error: `Your last session was ${lengthLabel(priorBooking.durationMinutes)}. Sessions are now 45 minutes, 1 hour, or 1 hour 15 minutes. Pick a length:`,
        code: "LENGTH_REQUIRED",
        options: coach?.hourlyRateCents ? lengthOptions(coach.hourlyRateCents) : [],
      },
      { status: 400 },
    );
  }

  // Same weekday and Pacific time, at least a week after the prior session (which may itself
  // still be upcoming). Weeks this parent already has booked with the coach at that time
  // are skipped; a slot someone else holds is left for the validation below to report.
  const now = new Date();
  const ownUpcoming = await prisma.booking.findMany({
    where: {
      parentProfileId: parentProfile.id,
      coachProfileId: priorBooking.coachProfileId,
      status: SLOT_HOLDING_STATUS_FILTER,
      scheduledAt: { gte: now },
    },
    select: { scheduledAt: true, durationMinutes: true },
  });
  const candidates = nextOccurrences(priorBooking.scheduledAt, now, REBOOK_WEEKS_TO_TRY);
  const scheduledAt = candidates.find(
    (c) => !ownUpcoming.some((b) => rangesOverlap(c, durationMinutes, b.scheduledAt, b.durationMinutes)),
  );
  if (!scheduledAt) {
    return NextResponse.json(
      { error: `You already have this time booked for the next ${REBOOK_WEEKS_TO_TRY} weeks. Use the regular booking form to pick a later date.` },
      { status: 409 },
    );
  }

  let validated;
  try {
    validated = await validateBookingRequest(parentProfile, {
      coachProfileId: priorBooking.coachProfileId,
      childId: priorBooking.childId,
      sport: priorBooking.sport,
      scheduledAt,
      durationMinutes,
      locationText: priorBooking.locationText,
      secondAdultName: priorBooking.secondAdultName ?? undefined,
    });
  } catch (err) {
    if (err instanceof BookingValidationError) {
      // Quick rebook has no field to name a second adult — point at the form that does.
      const message =
        err.message === SECOND_ADULT_REQUIRED_MESSAGE
          ? "This coach is under 18, so each session needs a second adult named. Use the regular booking form to add one."
          : err.message;
      // LEVEL_REQUIRED: the rebook button asks for the level inline, saves it, and retries.
      return NextResponse.json(
        { error: message, code: err.code, childId: priorBooking.childId, sport: priorBooking.sport },
        { status: err.status },
      );
    }
    throw err;
  }
  const { coach, childLevel, sport, breakdown, discountCents, totalDueCents, isFirstSession } = validated;

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
    childLevel,
    sport,
    scheduledAt,
    durationMinutes,
    locationText: priorBooking.locationText,
    secondAdultName: priorBooking.secondAdultName,
    priceCents: breakdown.sessionCostCents,
    platformFeeCents: breakdown.platformFeeCents,
    discountCents,
    isFirstSession,
    stripePaymentIntentId,
    stripePaymentMethodId,
    // Its QUICK_REBOOK points are awarded when the parent marks it complete (see the complete route).
    bookedViaQuickRebook: true,
  });

  if (!booking) {
    if (stripePaymentIntentId) {
      await cancelPaymentIntent(stripePaymentIntentId);
    }
    return NextResponse.json({ error: "That time was just booked by someone else. Try the regular booking form." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, bookingId: booking.id, scheduledAt: booking.scheduledAt });
}
