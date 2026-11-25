import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { handleStripeWebhook } from "@/lib/stripeWebhook";
import { deliverPackage } from "@/lib/packagePurchase";
import { notifyPackageReady } from "@/lib/notify";

/** Called by Stripe, not by the site: no session, only the signature (src/lib/stripeWebhook.ts). */
export async function POST(req: Request) {
  // The raw body, exactly as sent: the signature covers these bytes.
  const rawBody = await req.text();
  const answer = await handleStripeWebhook(rawBody, req.headers.get("stripe-signature"), {
    secret: process.env.STRIPE_WEBHOOK_SECRET,
    retrieveIntent: (id) => getStripe().paymentIntents.retrieve(id, { expand: ["latest_charge"] }),
    deliver: deliverPackage,
    onDelivered: notifyPackageReady,
  });
  return NextResponse.json(answer.body, { status: answer.httpStatus });
}
