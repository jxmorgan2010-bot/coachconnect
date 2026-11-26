import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { packageConfirmSchema } from "@/lib/validation";
import { deliverPackage } from "@/lib/packagePurchase";
import { notifyPackageReady } from "@/lib/notify";
import { getStripe } from "@/lib/stripe";

/**
 * Step 2 of a package purchase: the browser says the card went through. Nothing it sends is
 * trusted but the payment's id: whether it was paid, and what it bought, come from Stripe
 * (src/lib/packagePurchase.ts). If the browser never gets here, Stripe's webhook delivers the
 * package instead (POST /api/stripe/webhook); if the webhook was first, this returns that package.
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

  const intent = await getStripe().paymentIntents.retrieve(parsed.data.paymentIntentId, { expand: ["latest_charge"] });
  if (intent.metadata?.parentProfileId !== parentProfile.id) {
    return NextResponse.json({ error: "This payment doesn't belong to you." }, { status: 403 });
  }

  const result = await deliverPackage(intent);
  switch (result.status) {
    case "CREATED":
      notifyPackageReady(result.packageId);
      return NextResponse.json({ ok: true, packageId: result.packageId });
    case "EXISTING":
      return NextResponse.json({ ok: true, packageId: result.packageId });
    case "NOT_PAID":
      return NextResponse.json({ error: "Your card wasn't charged. Please try again.", code: "NOT_PAID" }, { status: 400 });
    case "NOT_A_PACKAGE":
      return NextResponse.json({ error: "This payment wasn't for a package." }, { status: 400 });
    case "REFUNDED":
      return NextResponse.json({ error: "This payment was refunded.", code: "REFUNDED" }, { status: 409 });
    case "UNDELIVERABLE":
      console.error(`Package payment ${intent.id} is paid but can't be delivered: ${result.reason}.`);
      return NextResponse.json({ error: "Your payment went through, but we couldn't set up the package." }, { status: 409 });
  }
}
