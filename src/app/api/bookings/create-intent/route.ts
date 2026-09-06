import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { bookingCreateSchema } from "@/lib/validation";
import { validateBookingRequest, BookingValidationError } from "@/lib/bookingValidation";
import { getStripe } from "@/lib/stripe";

// Stripe's practical minimum charge in USD — below this a booking needs no card at all
// (e.g. fully covered by referral credit).
const STRIPE_MIN_CENTS = 50;

/**
 * Step 1 of booking: validate the request and stand up a Stripe PaymentIntent with a
 * manual capture (a hold, not a charge) for the parent to confirm with their card on
 * this page. The booking itself isn't created until that card is confirmed — see
 * POST /api/bookings.
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
      return NextResponse.json({ error: err.message }, { status: err.status });
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

  const intent = await stripe.paymentIntents.create({
    amount: validated.totalDueCents,
    currency: "usd",
    customer: stripeCustomerId,
    payment_method_types: ["card"],
    capture_method: "manual",
    setup_future_usage: "off_session",
    metadata: {
      parentProfileId: parentProfile.id,
      coachProfileId: validated.coach.id,
    },
  });

  return NextResponse.json({
    ok: true,
    noPaymentRequired: false,
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    totalDueCents: validated.totalDueCents,
  });
}
