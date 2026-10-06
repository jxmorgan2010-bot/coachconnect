import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { bookingCreateSchema } from "@/lib/validation";
import {
  validateBookingRequest,
  validatePackageBookingRequest,
  createConfirmedBooking,
  BookingValidationError,
} from "@/lib/bookingValidation";
import { generateMockVideoCallUrl } from "@/lib/videoCall";
import { rangesOverlap } from "@/lib/bookingConflicts";
import { SLOT_HOLDING_STATUS_FILTER } from "@/lib/availability";
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

  if (data.packageId) {
    return handlePackageBooking(parentProfile.id, data.packageId, data);
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
  const { coach, sport, breakdown, discountCents, totalDueCents, isFirstSession } = validated;

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

  const booking = await createConfirmedBooking({
    parentProfileId: parentProfile.id,
    coachProfileId: coach.id,
    childId: data.childId,
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
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  const { package: pkg, sport, breakdown, isFirstSession } = validated;

  const now = new Date();
  const booking = await prisma.$transaction(async (tx) => {
    const stillActive = await tx.booking.findMany({
      where: { coachProfileId: pkg.coachProfileId, status: SLOT_HOLDING_STATUS_FILTER },
      select: { scheduledAt: true, durationMinutes: true },
    });
    if (stillActive.some((b) => rangesOverlap(data.scheduledAt, pkg.durationMinutes, b.scheduledAt, b.durationMinutes))) {
      throw new Error("CONFLICT");
    }

    const created = await tx.booking.create({
      data: {
        parentProfileId,
        coachProfileId: pkg.coachProfileId,
        childId: data.childId,
        sport,
        scheduledAt: data.scheduledAt,
        durationMinutes: pkg.durationMinutes,
        locationText: data.locationText,
        priceCents: breakdown.priceCents,
        platformFeeCents: breakdown.platformFeeCents,
        discountCents: breakdown.discountCents,
        status: "CONFIRMED",
        parentalConsent: true,
        secondAdultName: data.secondAdultName?.trim() || null,
        paymentStatus: "CAPTURED",
        capturedAt: now,
        packageId: pkg.id,
      },
    });

    const sessionsUsed = pkg.sessionsUsed + 1;
    await tx.sessionPackage.update({
      where: { id: pkg.id },
      data: {
        sessionsUsed,
        status: sessionsUsed >= pkg.totalSessions ? "DEPLETED" : "ACTIVE",
      },
    });

    let videoCallUrl: string | null = null;
    if (isFirstSession) {
      videoCallUrl = generateMockVideoCallUrl(created.id);
      await tx.booking.update({ where: { id: created.id }, data: { videoCallUrl } });
    }

    return { ...created, videoCallUrl };
  }).catch((err) => {
    if (err instanceof Error && err.message === "CONFLICT") return null;
    throw err;
  });

  if (!booking) {
    return NextResponse.json({ error: "That time was just booked by someone else. Pick another time." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, bookingId: booking.id, isFirstSession, videoCallUrl: booking.videoCallUrl });
}
