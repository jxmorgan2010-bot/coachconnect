import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { quickRebookSchema } from "@/lib/validation";
import {
  validateBookingRequest,
  validatePackageBookingRequest,
  createConfirmedBooking,
  createPackageBooking,
  isBookingConflict,
  BookingValidationError,
  SECOND_ADULT_REQUIRED_MESSAGE,
  CHILD_BUSY,
  CHILD_BUSY_NEXT_STEP,
} from "@/lib/bookingValidation";
import { nextOccurrences } from "@/lib/rebook";
import { chargeOffSessionHold, cancelPaymentIntent, STRIPE_MIN_CENTS } from "@/lib/payment";
import { rangesOverlap } from "@/lib/bookingConflicts";
import { SLOT_HOLDING_STATUS_FILTER } from "@/lib/availability";
import { notifyBookingCreated } from "@/lib/notify";
import { getStripe } from "@/lib/stripe";
import { holdDueAt, holdsAtBooking } from "@/lib/holdTiming";
import { findRebookCard, findRebookPackage, type PackageCardInfo, type SavedCardInfo } from "@/lib/quickRebookPayment";
import { isAllowedLength, lengthLabel, lengthOptions, LENGTH_NOT_ALLOWED_MESSAGE } from "@/lib/sessionLengths";

// Quick rebook picks the time itself, so the way forward is the form where the parent picks one.
const rebookChildBusy = (message: string) =>
  message.replace(CHILD_BUSY_NEXT_STEP, "Use the regular booking form to pick another time.");

// How many weeks ahead quick rebook looks for a week the parent doesn't already have booked.
const REBOOK_WEEKS_TO_TRY = 4;

/**
 * One-click "book this coach again": same coach, child, sport, duration, and location as a prior
 * booking, at the next occurrence of the same weekday/time. (If the prior length can no longer be
 * booked, the parent is asked to pick a current one.)
 *
 * How it's paid (src/lib/quickRebookPayment.ts):
 * 1. A session left in a package with this coach, for the same sport and length, is used first.
 *    No Stripe call, same as booking from the package on the booking form.
 * 2. Otherwise a saved card (no Stripe Elements on this screen): the card from the prior booking,
 *    or else the newest card saved on another booking or a package, which the parent must confirm by name
 *    first (CONFIRM_CARD). A session 2 days away or less is held off-session now; one further
 *    out is booked on the saved card and the card-holds job places the hold 2 days before, same
 *    as the booking form (src/lib/holdTiming.ts).
 * 3. No usable card: NO_SAVED_CARD, and the button links to the coach's booking form.
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
  const childId = priorBooking.childId;

  // Same length as last time. A package with sessions left at that length is used as is (a
  // package keeps the length it was bought for). Otherwise, if that length can no longer be
  // booked, the parent picks one of the current lengths (the button shows them with prices and
  // retries).
  const requestedLength = parsed.data.durationMinutes ?? priorBooking.durationMinutes;
  const pkg = await findRebookPackage(parentProfile.id, priorBooking.coachProfileId, priorBooking.sport, requestedLength);
  const durationMinutes = requestedLength;
  if (!pkg && !isAllowedLength(durationMinutes)) {
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

  const validationError = (err: unknown) => {
    if (!(err instanceof BookingValidationError)) throw err;
    // Quick rebook has no field to name a second adult — point at the form that does.
    const message =
      err.message === SECOND_ADULT_REQUIRED_MESSAGE
        ? "This coach is under 18, so each session needs a second adult named. Use the regular booking form to add one."
        : err.code === CHILD_BUSY
          ? rebookChildBusy(err.message)
          : err.message;
    // LEVEL_REQUIRED: the rebook button asks for the level inline, saves it, and retries.
    return NextResponse.json(
      { error: message, code: err.code, childId, sport: priorBooking.sport },
      { status: err.status },
    );
  };

  // 1. A package session, before any card.
  if (pkg) {
    let validatedPkg;
    try {
      validatedPkg = await validatePackageBookingRequest(parentProfile, {
        packageId: pkg.id,
        childId,
        scheduledAt,
        locationText: priorBooking.locationText,
        secondAdultName: priorBooking.secondAdultName ?? undefined,
      });
    } catch (err) {
      return validationError(err);
    }
    const booking = await createPackageBooking({
      parentProfileId: parentProfile.id,
      childId,
      scheduledAt,
      locationText: priorBooking.locationText,
      secondAdultName: priorBooking.secondAdultName,
      validated: validatedPkg,
      // Its QUICK_REBOOK points are awarded when the parent marks it complete (see markComplete.ts).
      bookedViaQuickRebook: true,
    });
    if (isBookingConflict(booking)) {
      if (booking.conflict === CHILD_BUSY) {
        return NextResponse.json({ error: rebookChildBusy(booking.message), code: CHILD_BUSY }, { status: 409 });
      }
      if (booking.conflict === "PACKAGE_EMPTY") {
        return NextResponse.json({ error: "Your package's last session was just used. Try quick rebook again to pay by card." }, { status: 409 });
      }
      return NextResponse.json({ error: "That time was just booked by someone else. Try the regular booking form." }, { status: 409 });
    }
    notifyBookingCreated(booking.id);
    return NextResponse.json({
      ok: true,
      bookingId: booking.id,
      scheduledAt: booking.scheduledAt,
      paidWith: "package",
      packageSessionsLeft: booking.packageSessionsLeft,
    });
  }

  // 2. A saved card.
  let validated;
  try {
    validated = await validateBookingRequest(parentProfile, {
      coachProfileId: priorBooking.coachProfileId,
      childId,
      sport: priorBooking.sport,
      scheduledAt,
      durationMinutes,
      locationText: priorBooking.locationText,
      secondAdultName: priorBooking.secondAdultName ?? undefined,
    });
  } catch (err) {
    return validationError(err);
  }
  const { coach, childLevel, sport, breakdown, discountCents, totalDueCents, isFirstSession } = validated;

  let stripePaymentIntentId: string | null = null;
  let stripePaymentMethodId: string | null = null;
  let holdDue: Date | null = null;
  let cardLabel: string | null = null;
  if (totalDueCents >= STRIPE_MIN_CENTS) {
    const customer = parentProfile.stripeCustomerId;
    const card = await findRebookCard({
      parentProfileId: parentProfile.id,
      stripeCustomerId: customer,
      priorBooking,
      retrieveCard: retrieveSavedCard,
      retrievePackageCard,
    });
    if (!customer || !card) {
      return NextResponse.json(
        {
          error: "You don't have a card saved with us yet. Book on the booking form, which saves your card for next time.",
          code: "NO_SAVED_CARD",
          coachProfileId: priorBooking.coachProfileId,
        },
        { status: 400 },
      );
    }
    // A card from a different booking or a package is only used once the parent has seen which one it is.
    if (card.source !== "PRIOR_BOOKING" && parsed.data.confirmCardId !== card.paymentMethodId) {
      return NextResponse.json(
        {
          error: `Confirm the card for this session: ${card.label}.`,
          code: "CONFIRM_CARD",
          card: { id: card.paymentMethodId, label: card.label, source: card.source },
          scheduledAt,
          totalDueCents,
        },
        { status: 409 },
      );
    }
    cardLabel = card.label;
    if (!holdsAtBooking(scheduledAt)) {
      // More than 2 days away: no hold yet (src/lib/holdTiming.ts). findRebookCard has checked the
      // card is still on the parent's Stripe customer; the card-holds job places the hold 2 days before.
      stripePaymentMethodId = card.paymentMethodId;
      holdDue = holdDueAt(scheduledAt);
    } else {
      try {
        const intent = await chargeOffSessionHold(customer, card.paymentMethodId, totalDueCents);
        stripePaymentIntentId = intent.id;
        stripePaymentMethodId = card.paymentMethodId;
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
    childId,
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
  return NextResponse.json({ ok: true, bookingId: booking.id, scheduledAt: booking.scheduledAt, paidWith: "card", cardLabel });
}

async function retrievePackageCard(paymentIntentId: string): Promise<PackageCardInfo | null> {
  const intent = await getStripe().paymentIntents.retrieve(paymentIntentId, { expand: ["payment_method"] });
  const card = intent.payment_method;
  if (!card || typeof card === "string") return null;
  return {
    paymentMethodId: card.id,
    customerId: typeof card.customer === "string" ? card.customer : (card.customer?.id ?? null),
    brand: card.card?.brand ?? null,
    last4: card.card?.last4 ?? null,
  };
}

async function retrieveSavedCard(paymentMethodId: string): Promise<SavedCardInfo> {
  const card = await getStripe().paymentMethods.retrieve(paymentMethodId);
  return {
    customerId: typeof card.customer === "string" ? card.customer : (card.customer?.id ?? null),
    brand: card.card?.brand ?? null,
    last4: card.card?.last4 ?? null,
  };
}
