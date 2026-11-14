import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { quickRebookSchema } from "@/lib/validation";
import {
  validateBookingRequest,
  createConfirmedBooking,
  isBookingConflict,
  BookingValidationError,
  SECOND_ADULT_REQUIRED_MESSAGE,
  CHILD_BUSY,
  CHILD_BUSY_NEXT_STEP,
} from "@/lib/bookingValidation";

// Quick rebook picks the time itself, so the way forward is the form where the parent picks one.
const rebookChildBusy = (message: string) =>
  message.replace(CHILD_BUSY_NEXT_STEP, "Use the regular booking form to pick another time.");
import { nextOccurrences } from "@/lib/rebook";
import { chargeOffSessionHold, cancelPaymentIntent, STRIPE_MIN_CENTS } from "@/lib/payment";
import { rangesOverlap } from "@/lib/bookingConflicts";
import { SLOT_HOLDING_STATUS_FILTER } from "@/lib/availability";
import { notifyBookingCreated } from "@/lib/notify";
import { getStripe } from "@/lib/stripe";
import { holdDueAt, holdsAtBooking } from "@/lib/holdTiming";

// How many weeks ahead quick rebook looks for a week the parent doesn't already have booked.
const REBOOK_WEEKS_TO_TRY = 4;
import { isAllowedLength, lengthLabel, lengthOptions, LENGTH_NOT_ALLOWED_MESSAGE } from "@/lib/sessionLengths";

/**
 * One-click "book this coach again" — same coach, child, sport, duration, and location
 * as a prior booking, at the next occurrence of the same weekday/time. (If the prior
 * length can no longer be booked, the parent is asked to pick a current one.) Uses the card
 * saved from that prior booking (no Stripe Elements on this screen): a session 2 days away or
 * less is held off-session now; one further out is booked on the saved card and the card-holds
 * job places the hold 2 days before, same as the booking form (src/lib/holdTiming.ts).
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
          : err.code === CHILD_BUSY
            ? rebookChildBusy(err.message)
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
  let holdDue: Date | null = null;
  if (totalDueCents >= STRIPE_MIN_CENTS) {
    const customer = parentProfile.stripeCustomerId;
    const savedCard = priorBooking.stripePaymentMethodId;
    if (!customer || !savedCard) {
      return NextResponse.json({ error: "No saved card on file — use the regular booking form instead." }, { status: 400 });
    }
    if (!holdsAtBooking(scheduledAt)) {
      // More than 2 days away: no hold yet (src/lib/holdTiming.ts). Just check the saved card is
      // still on the parent's Stripe customer; the card-holds job places the hold 2 days before.
      const card = await getStripe().paymentMethods.retrieve(savedCard);
      const owner = typeof card.customer === "string" ? card.customer : card.customer?.id;
      if (owner !== customer) {
        return NextResponse.json({ error: "Your saved card is no longer on file — use the regular booking form instead." }, { status: 400 });
      }
      stripePaymentMethodId = savedCard;
      holdDue = holdDueAt(scheduledAt);
    } else {
      try {
        const intent = await chargeOffSessionHold(customer, savedCard, totalDueCents);
        stripePaymentIntentId = intent.id;
        stripePaymentMethodId = savedCard;
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
    holdDueAt: holdDue,
    // Its QUICK_REBOOK points are awarded when the parent marks it complete (see the complete route).
    bookedViaQuickRebook: true,
  });

  if (isBookingConflict(booking)) {
    if (stripePaymentIntentId) {
      await cancelPaymentIntent(stripePaymentIntentId);
    }
    return booking.conflict === CHILD_BUSY
      ? NextResponse.json({ error: rebookChildBusy(booking.message), code: CHILD_BUSY }, { status: 409 })
      : NextResponse.json({ error: "That time was just booked by someone else. Try the regular booking form." }, { status: 409 });
  }

  notifyBookingCreated(booking.id);
  return NextResponse.json({ ok: true, bookingId: booking.id, scheduledAt: booking.scheduledAt });
}
