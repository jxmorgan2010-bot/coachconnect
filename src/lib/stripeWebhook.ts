import Stripe from "stripe";
import { isPackageIntent, type DeliveryResult, type PackageIntent } from "@/lib/packageIntent";

/**
 * Stripe's webhook (POST /api/stripe/webhook). One job: deliver a paid package when the parent's
 * browser never came back to ask for it.
 *
 * - The signature is checked on the raw body with STRIPE_WEBHOOK_SECRET; Stripe's library also
 *   refuses a signature more than 5 minutes old.
 * - The event only says which payment to look at. What it was for, whether it was paid and whether
 *   it was refunded are read back from Stripe.
 * - Stripe can send an event more than once, and retries anything but a 2xx answer. Delivering is
 *   safe to repeat (src/lib/packagePurchase.ts), so no record of events is kept.
 */

export type WebhookAnswer = { httpStatus: number; body: Record<string, unknown> };

export type WebhookDeps = {
  secret: string | undefined;
  retrieveIntent: (id: string) => Promise<PackageIntent>;
  deliver: (intent: PackageIntent) => Promise<DeliveryResult>;
  onDelivered: (packageId: string) => void;
};

export async function handleStripeWebhook(rawBody: string, signature: string | null, deps: WebhookDeps): Promise<WebhookAnswer> {
  const secret = deps.secret?.trim();
  if (!secret) {
    // Not a 2xx, so Stripe keeps retrying until the secret is set.
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET is not set; refusing the event.");
    return { httpStatus: 503, body: { error: "Webhook not configured." } };
  }
  if (!signature) return { httpStatus: 400, body: { error: "Missing signature." } };

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    console.error("[stripe webhook] Refused an event with a bad signature.");
    return { httpStatus: 400, body: { error: "Bad signature." } };
  }

  if (event.type !== "payment_intent.succeeded") return { httpStatus: 200, body: { received: true, ignored: event.type } };
  // Every captured hold and tip sends this event too: skip those without a Stripe lookup.
  if (!isPackageIntent(event.data.object.metadata)) return { httpStatus: 200, body: { received: true, ignored: "not a package" } };

  const intentId = event.data.object.id;
  try {
    const result = await deps.deliver(await deps.retrieveIntent(intentId));
    if (result.status === "CREATED") {
      console.log(`[stripe webhook] Delivered package ${result.packageId} for ${intentId}.`);
      deps.onDelivered(result.packageId);
    }
    if (result.status === "UNDELIVERABLE") {
      // A failed delivery shows up in Stripe's dashboard, where someone can refund it.
      console.error(`[stripe webhook] Payment ${intentId} is paid but can't be delivered: ${result.reason}.`);
      return { httpStatus: 500, body: { error: "Paid, but the package can't be delivered." } };
    }
    return { httpStatus: 200, body: { received: true, result: result.status } };
  } catch (err) {
    console.error(`[stripe webhook] Couldn't deliver ${intentId}; Stripe will retry.`, err);
    return { httpStatus: 500, body: { error: "Couldn't deliver the package." } };
  }
}
