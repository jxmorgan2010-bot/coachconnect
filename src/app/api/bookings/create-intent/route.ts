import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { bookingCreateSchema } from "@/lib/validation";
import { validateBookingRequest, BookingValidationError } from "@/lib/bookingValidation";
import { getStripe } from "@/lib/stripe";
import { createCardSetupIntent, STRIPE_MIN_CENTS } from "@/lib/payment";
import { holdDueAt, holdsAtBooking } from "@/lib/holdTiming";

/**
 * Step 1 of booking: validate the request and stand up what the parent confirms with their card
 * on this page (src/lib/holdTiming.ts):
 * - a session more than 2 days away gets a SetupIntent: the card is checked and saved, with any
 *   bank authentication done now, and the hold is placed 2 days before by the card-holds job;
 * - a session 2 days away or less gets a PaymentIntent with manual capture: the hold, now.
 * The booking itself isn't created until the card is confirmed — see POST /api/bookings.
 */
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

  const parentProfile = await prisma.parentProfile.findUnique({
    where: { userId: session.user.id },
    include: { user: true },
  });
  if (!parentProfile) {
    return NextResponse.json({ error: "Parent profile not found." }, { status: 404 });
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

  if (validated.totalDueCents < STRIPE_MIN_CENTS) {
    return NextResponse.json({ ok: true, noPaymentRequired: true, totalDueCents: validated.totalDueCents });
  }

  const stripe = getStripe();

  let stripeCustomerId = parentProfile.stripeCustomerId;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: parentProfile.user.email,
      name: parentProfile.user.name,
      metadata: { parentProfileId: parentProfile.id },
    });
    stripeCustomerId = customer.id;
    await prisma.parentProfile.update({ where: { id: parentProfile.id }, data: { stripeCustomerId } });
  }

  const metadata = { parentProfileId: parentProfile.id, coachProfileId: validated.coach.id };
  if (!holdsAtBooking(data.scheduledAt)) {
    const setup = await createCardSetupIntent(stripeCustomerId, metadata);
    return NextResponse.json({
      ok: true,
      noPaymentRequired: false,
      mode: "SETUP",
      clientSecret: setup.client_secret,
      setupIntentId: setup.id,
      holdDueAt: holdDueAt(data.scheduledAt).toISOString(),
      totalDueCents: validated.totalDueCents,
    });
  }

  const intent = await stripe.paymentIntents.create({
    amount: validated.totalDueCents,
    currency: "usd",
    customer: stripeCustomerId,
    payment_method_types: ["card"],
    capture_method: "manual",
    setup_future_usage: "off_session",
    metadata,
  });

  return NextResponse.json({
    ok: true,
    noPaymentRequired: false,
    mode: "HOLD",
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    totalDueCents: validated.totalDueCents,
  });
}
