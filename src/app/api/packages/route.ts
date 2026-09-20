import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { packageConfirmSchema } from "@/lib/validation";
import { calculateBundlePricing, BUNDLE_SESSION_COUNT, BUNDLE_DISCOUNT_PERCENT } from "@/lib/bundles";
import { getStripe } from "@/lib/stripe";
import type { Sport } from "@/generated/prisma/client";

/**
 * Step 2 of a package purchase: verify the PaymentIntent actually succeeded, then create
 * the SessionPackage from the coach's rate at confirmation time (never from client-
 * supplied pricing) — same defense-in-depth as POST /api/bookings re-pricing before it
 * trusts an intent.
 */
export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Only parent accounts can buy a package." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = packageConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const parentProfile = await prisma.parentProfile.findUnique({ where: { userId: session.user.id } });
  if (!parentProfile) {
    return NextResponse.json({ error: "Parent profile not found." }, { status: 404 });
  }

  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(parsed.data.paymentIntentId);
  if (intent.metadata?.parentProfileId !== parentProfile.id) {
    return NextResponse.json({ error: "This payment doesn't belong to you." }, { status: 403 });
  }
  if (intent.status !== "succeeded") {
    return NextResponse.json({ error: "Your card wasn't charged. Please try again." }, { status: 400 });
  }

  const existing = await prisma.sessionPackage.findUnique({ where: { stripePaymentIntentId: intent.id } });
  if (existing) {
    return NextResponse.json({ ok: true, packageId: existing.id });
  }

  const coachProfileId = intent.metadata.coachProfileId;
  const sport = intent.metadata.sport as Sport;
  const durationMinutes = Number(intent.metadata.durationMinutes);

  const coach = await prisma.coachProfile.findUnique({ where: { id: coachProfileId } });
  if (!coach || !coach.hourlyRateCents) {
    return NextResponse.json({ error: "Coach not found." }, { status: 404 });
  }

  const pricing = calculateBundlePricing(coach.hourlyRateCents, durationMinutes);
  if (pricing.totalChargedCents !== intent.amount) {
    return NextResponse.json({ error: "The price changed — contact support." }, { status: 409 });
  }

  const pkg = await prisma.sessionPackage.create({
    data: {
      parentProfileId: parentProfile.id,
      coachProfileId: coach.id,
      sport,
      durationMinutes,
      totalSessions: BUNDLE_SESSION_COUNT,
      pricePerSessionCents: pricing.pricePerSessionCents,
      discountPercent: BUNDLE_DISCOUNT_PERCENT,
      totalChargedCents: pricing.totalChargedCents,
      stripePaymentIntentId: intent.id,
    },
  });

  return NextResponse.json({ ok: true, packageId: pkg.id });
}
