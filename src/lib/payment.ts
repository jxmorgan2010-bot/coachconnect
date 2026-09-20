import { getStripe } from "@/lib/stripe";

/**
 * Thin wrappers around the Stripe calls that move money for a booking. A booking whose
 * total was under Stripe's practical minimum charge (fully covered by referral credit)
 * never got a PaymentIntent in the first place, so every function here is a no-op when
 * the relevant Stripe id is null.
 */

export async function capturePaymentIntent(stripePaymentIntentId: string | null, amountCents: number, label = "session") {
  if (!stripePaymentIntentId) {
    console.log(`💳 [payment] No card hold to capture (${label}) — session total was covered without a charge.`);
    return;
  }
  const stripe = getStripe();
  await stripe.paymentIntents.capture(stripePaymentIntentId, { amount_to_capture: amountCents });
  console.log(`💳 [payment] Captured $${(amountCents / 100).toFixed(2)} (${label}) — intent ${stripePaymentIntentId}`);
}

export async function cancelPaymentIntent(stripePaymentIntentId: string | null) {
  if (!stripePaymentIntentId) return;
  const stripe = getStripe();
  await stripe.paymentIntents.cancel(stripePaymentIntentId);
  console.log(`💳 [payment] Cancelled/voided hold — intent ${stripePaymentIntentId} — parent was never charged`);
}

export async function refundCapturedPayment(stripePaymentIntentId: string | null, amountCents: number) {
  if (!stripePaymentIntentId) return;
  const stripe = getStripe();
  await stripe.refunds.create({ payment_intent: stripePaymentIntentId, amount: amountCents });
  console.log(`💳 [payment] Refunded $${(amountCents / 100).toFixed(2)} — intent ${stripePaymentIntentId}`);
}

/** Tips are charged off-session against the card saved during booking, no further customer action needed. */
export async function chargeTipOffSession(stripeCustomerId: string | null, stripePaymentMethodId: string | null, amountCents: number) {
  if (!stripeCustomerId || !stripePaymentMethodId) {
    console.log(`💳 [payment] No saved card on file to charge a $${(amountCents / 100).toFixed(2)} tip — skipping charge.`);
    return;
  }
  const stripe = getStripe();
  await stripe.paymentIntents.create({
    amount: amountCents,
    currency: "usd",
    customer: stripeCustomerId,
    payment_method: stripePaymentMethodId,
    off_session: true,
    confirm: true,
  });
  console.log(`💳 [payment] Charged tip of $${(amountCents / 100).toFixed(2)} off-session.`);
}

/**
 * "Quick rebook" holds the card on file off-session — same manual-capture hold as a
 * normal booking (so complete/no-show/dispute all work unmodified), just confirmed
 * without the parent re-entering their card. Throws on Stripe's `authentication_required`
 * (a real possibility off-session) — callers should catch that and point the parent back
 * at the normal booking form to re-authenticate their card.
 */
export async function chargeOffSessionHold(stripeCustomerId: string, stripePaymentMethodId: string, amountCents: number) {
  const stripe = getStripe();
  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: "usd",
    customer: stripeCustomerId,
    payment_method: stripePaymentMethodId,
    capture_method: "manual",
    off_session: true,
    confirm: true,
  });
  console.log(`💳 [payment] Off-session hold of $${(amountCents / 100).toFixed(2)} authorized for quick rebook — intent ${intent.id}`);
  return intent;
}
