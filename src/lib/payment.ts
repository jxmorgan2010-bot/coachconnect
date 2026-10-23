import { getStripe } from "@/lib/stripe";

/**
 * Thin wrappers around the Stripe calls that move money for a booking. A booking whose
 * total was under Stripe's practical minimum charge (fully covered by referral credit)
 * never got a PaymentIntent in the first place, so every function here is a no-op when
 * the relevant Stripe id is null.
 */

/**
 * Charges a booking's held card for `amountCents` (completion, auto-release, late cancel).
 *
 * Stripe cancels an uncaptured hold after about 7 days, so a session booked further ahead
 * can reach this point with no live hold. A CONFIRMED booking's hold is only ever cancelled
 * by that expiry, so in that case the card saved at booking (setup_future_usage) is charged
 * off-session instead. Returns the PaymentIntent that now holds the money: the same id, the
 * new charge's id, or null when the booking never had a card hold (covered by credit).
 * Throws if Stripe declines, so callers can leave the booking flagged for an admin.
 */
export async function captureHeldPayment({
  stripePaymentIntentId,
  stripeCustomerId,
  stripePaymentMethodId,
  amountCents,
  label = "session",
}: {
  stripePaymentIntentId: string | null;
  stripeCustomerId: string | null;
  stripePaymentMethodId: string | null;
  amountCents: number;
  label?: string;
}): Promise<string | null> {
  if (!stripePaymentIntentId) {
    console.log(`💳 [payment] No card hold to capture (${label}) — session total was covered without a charge.`);
    return null;
  }
  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);

  // A retried request after an earlier capture went through.
  if (intent.status === "succeeded") return intent.id;

  if (intent.status === "requires_capture") {
    await stripe.paymentIntents.capture(intent.id, { amount_to_capture: amountCents });
    console.log(`💳 [payment] Captured $${(amountCents / 100).toFixed(2)} (${label}) — intent ${intent.id}`);
    return intent.id;
  }

  if (intent.status === "canceled" && stripeCustomerId && stripePaymentMethodId) {
    const charge = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "usd",
      customer: stripeCustomerId,
      payment_method: stripePaymentMethodId,
      off_session: true,
      confirm: true,
      metadata: { ...intent.metadata, replacesExpiredHold: intent.id },
    });
    if (charge.status !== "succeeded") {
      throw new Error(`Off-session charge ${charge.id} for an expired hold ended as ${charge.status}.`);
    }
    console.log(`💳 [payment] Hold ${intent.id} had expired; charged $${(amountCents / 100).toFixed(2)} (${label}) off-session — intent ${charge.id}`);
    return charge.id;
  }

  throw new Error(`PaymentIntent ${intent.id} can't be charged (status ${intent.status}, no saved card to fall back on).`);
}

/** Releases a card hold. A hold Stripe already cancelled (it expired) counts as released. */
export async function cancelPaymentIntent(stripePaymentIntentId: string | null) {
  if (!stripePaymentIntentId) return;
  const stripe = getStripe();
  try {
    await stripe.paymentIntents.cancel(stripePaymentIntentId);
  } catch (err) {
    const alreadyCancelled = (err as { payment_intent?: { status?: string } }).payment_intent?.status === "canceled";
    if (!alreadyCancelled) throw err;
  }
  console.log(`💳 [payment] Cancelled/voided hold — intent ${stripePaymentIntentId} — parent was never charged`);
}

/** Refunds part or all of a captured payment. Returns Stripe's refund id. */
export async function refundCapturedPayment(stripePaymentIntentId: string, amountCents: number): Promise<string> {
  const stripe = getStripe();
  const refund = await stripe.refunds.create({ payment_intent: stripePaymentIntentId, amount: amountCents });
  console.log(`💳 [payment] Refunded $${(amountCents / 100).toFixed(2)} — intent ${stripePaymentIntentId} — refund ${refund.id}`);
  return refund.id;
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
