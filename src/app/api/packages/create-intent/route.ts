import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { packagePurchaseSchema } from "@/lib/validation";
import { isCoachLive } from "@/lib/coach";
import { calculateBundlePricing } from "@/lib/bundles";
import { getStripe } from "@/lib/stripe";

/**
 * Step 1 of a package purchase: validate the coach/sport, price the bundle, and stand up
 * a Stripe PaymentIntent for the full discounted total. Unlike a single-session booking
 * hold, this uses automatic capture — buying a package is a real purchase, not a hold
 * released later. The SessionPackage row itself isn't created until the card is
 * confirmed — see POST /api/packages.
 */
export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Only parent accounts can buy a package." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = packagePurchaseSchema.safeParse(body);
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

  const coach = await prisma.coachProfile.findUnique({
    where: { id: data.coachProfileId },
    include: { sports: true },
  });
  if (!coach || !isCoachLive(coach) || !coach.hourlyRateCents) {
    return NextResponse.json({ error: "This coach isn't available for a package right now." }, { status: 400 });
  }
  if (!coach.sports.some((s) => s.sport === data.sport)) {
    return NextResponse.json({ error: "This coach doesn't offer that sport." }, { status: 400 });
  }

  const pricing = calculateBundlePricing(coach.hourlyRateCents, data.durationMinutes);

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
    amount: pricing.totalChargedCents,
    currency: "usd",
    customer: stripeCustomerId,
    payment_method_types: ["card"],
    metadata: {
      parentProfileId: parentProfile.id,
      coachProfileId: coach.id,
      sport: data.sport,
      durationMinutes: String(data.durationMinutes),
    },
  });

  return NextResponse.json({
    ok: true,
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
    pricing,
  });
}
