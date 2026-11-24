import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { bookingCreateSchema } from "@/lib/validation";
import {
  validateBookingRequest,
  validatePackageBookingRequest,
  createConfirmedBooking,
  createPackageBooking,
  isBookingConflict,
  BookingValidationError,
  CHILD_BUSY,
} from "@/lib/bookingValidation";
import { getStripe } from "@/lib/stripe";
import { notifyBookingCreated } from "@/lib/notify";
import { STRIPE_MIN_CENTS } from "@/lib/payment";
import { holdDueAt } from "@/lib/holdTiming";

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

  if (data.packageId) {
    return handlePackageBooking(parentProfile.id, data.packageId, data);
  }

  let validated;
  try {
    validated = await validateBookingRequest(parentProfile, data);
  } catch (err) {
    if (err instanceof BookingValidationError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    throw err;
  }
  const { coach, childLevel, sport, breakdown, discountCents, totalDueCents, isFirstSession } = validated;

  // Anything above Stripe's practical minimum charge needs a card: saved now with the hold placed
  // 2 days before (a SetupIntent), or held now (a PaymentIntent). Verify whichever it is before
  // creating the booking.
  let stripePaymentIntentId: string | null = null;
  let stripePaymentMethodId: string | null = null;
  let holdDue: Date | null = null;
  if (totalDueCents >= STRIPE_MIN_CENTS && data.setupIntentId) {
    const setup = await getStripe().setupIntents.retrieve(data.setupIntentId);
    if (setup.metadata?.parentProfileId !== parentProfile.id) {
      return NextResponse.json({ error: "This card doesn't belong to you." }, { status: 403 });
    }
    const card = typeof setup.payment_method === "string" ? setup.payment_method : (setup.payment_method?.id ?? null);
    if (setup.status !== "succeeded" || !card) {
      return NextResponse.json({ error: "Your card wasn't saved. Please re-enter your card details." }, { status: 400 });
    }
    stripePaymentMethodId = card;
    // If the form sat open past the 2-day mark, this is already due and the next job run places it.
    holdDue = holdDueAt(data.scheduledAt);
  } else if (totalDueCents >= STRIPE_MIN_CENTS) {
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

  const booking = await createConfirmedBooking({
    parentProfileId: parentProfile.id,
    coachProfileId: coach.id,
    childId: data.childId,
    childLevel,
    sport,
    scheduledAt: data.scheduledAt,
    durationMinutes: data.durationMinutes,
    locationText: data.locationText,
    secondAdultName: data.secondAdultName,
    priceCents: breakdown.sessionCostCents,
    platformFeeCents: breakdown.platformFeeCents,
    discountCents,
    isFirstSession,
    stripePaymentIntentId,
    stripePaymentMethodId,
    holdDueAt: holdDue,
  });

  if (isBookingConflict(booking)) {
    if (stripePaymentIntentId) {
      await getStripe().paymentIntents.cancel(stripePaymentIntentId).catch(() => {});
    }
    return booking.conflict === CHILD_BUSY
      ? NextResponse.json({ error: booking.message, code: CHILD_BUSY }, { status: 409 })
      : NextResponse.json({ error: "That time was just booked by someone else. Pick another time." }, { status: 409 });
  }

  notifyBookingCreated(booking.id);
  return NextResponse.json({
    ok: true,
    bookingId: booking.id,
    isFirstSession,
    videoCallUrl: booking.videoCallUrl,
  });
}

/**
 * Bundled sessions skip Stripe entirely — the package was already paid for in full at
 * purchase, so this just spends one unit of capacity and creates a CAPTURED booking.
 * No Stripe PaymentIntent is ever created for an individual bundled session, so unlike
 * the card path above there's nothing to cancel when a conflict is hit.
 */
async function handlePackageBooking(
  parentProfileId: string,
  packageId: string,
  data: { childId: string; scheduledAt: Date; locationText: string; secondAdultName?: string },
) {
  const parentProfile = await prisma.parentProfile.findUniqueOrThrow({ where: { id: parentProfileId } });

  let validated;
  try {
    validated = await validatePackageBookingRequest(parentProfile, {
      packageId,
      childId: data.childId,
      scheduledAt: data.scheduledAt,
      locationText: data.locationText,
      secondAdultName: data.secondAdultName,
    });
  } catch (err) {
    if (err instanceof BookingValidationError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    throw err;
  }
  const booking = await createPackageBooking({
    parentProfileId,
    childId: data.childId,
    scheduledAt: data.scheduledAt,
    locationText: data.locationText,
    secondAdultName: data.secondAdultName,
    validated,
  });

  if (isBookingConflict(booking)) {
    if (booking.conflict === CHILD_BUSY) {
      return NextResponse.json({ error: booking.message, code: CHILD_BUSY }, { status: 409 });
    }
    if (booking.conflict === "PACKAGE_EMPTY") {
      return NextResponse.json({ error: "This package has no sessions left." }, { status: 400 });
    }
    return NextResponse.json({ error: "That time was just booked by someone else. Pick another time." }, { status: 409 });
  }

  notifyBookingCreated(booking.id);
  return NextResponse.json({ ok: true, bookingId: booking.id, isFirstSession: validated.isFirstSession, videoCallUrl: booking.videoCallUrl });
}
