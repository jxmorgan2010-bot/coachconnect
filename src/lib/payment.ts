import { getStripe } from "@/lib/stripe";

/**
 * Thin wrappers around the Stripe calls that move money for a booking. A booking whose
 * total was under Stripe's practical minimum charge (fully covered by referral credit)
 * never got a PaymentIntent in the first place, so every function here is a no-op when
 * the relevant Stripe id is null.
 */

// Stripe's practical minimum charge in USD. Below it a booking needs no card at all (e.g. fully
// covered by referral credit).
export const STRIPE_MIN_CENTS = 50;

/**
 * Charges a booking's card for `amountCents` (completion, auto-release, late cancel).
 *
 * A booking can reach this point with no live hold in two ways: Stripe cancels an uncaptured
 * hold after about 7 days, and a hold due 2 days before the session (src/lib/cardHolds.ts) may
 * not have been placed yet. Either way the card saved at booking is charged off-session instead.
 * Returns the PaymentIntent that now holds the money: the same id, the new charge's id, or null
 * when the booking has no card at all (covered by credit). Throws if Stripe declines, so callers
 * can leave the booking flagged for an admin.
 *
 * Every Stripe call carries an idempotency key, so a repeated or concurrent call for the same
 * booking (the parent marking it complete while auto-release runs, a job run twice, a retry after
 * a crash) gets the first call's result instead of charging again.
 */
export async function captureHeldPayment({
  bookingId,
  stripePaymentIntentId,
  stripeCustomerId,
  stripePaymentMethodId,
  amountCents,
  label = "session",
}: {
  bookingId: string;
  stripePaymentIntentId: string | null;
  stripeCustomerId: string | null;
  stripePaymentMethodId: string | null;
  amountCents: number;
  label?: string;
}): Promise<string | null> {
  if (!stripePaymentIntentId) {
    if (stripeCustomerId && stripePaymentMethodId && amountCents >= STRIPE_MIN_CENTS) {
      return chargeSavedCard({ bookingId, stripeCustomerId, stripePaymentMethodId, amountCents, label, reason: "no hold placed" });
    }
    console.log(`💳 [payment] No card hold to capture (${label}) — session total was covered without a charge.`);
    return null;
  }
  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);

  // A retried request after an earlier capture went through.
  if (intent.status === "succeeded") return intent.id;

  if (intent.status === "requires_capture") {
    await stripe.paymentIntents.capture(
      intent.id,
      { amount_to_capture: amountCents },
      { idempotencyKey: `capture:${intent.id}:${amountCents}` },
    );
    console.log(`💳 [payment] Captured $${(amountCents / 100).toFixed(2)} (${label}) — intent ${intent.id}`);
    return intent.id;
  }

  if (intent.status === "canceled" && stripeCustomerId && stripePaymentMethodId) {
    return chargeSavedCard({
      bookingId,
      stripeCustomerId,
      stripePaymentMethodId,
      amountCents,
      label,
      reason: `hold ${intent.id} had expired`,
      metadata: { ...intent.metadata, replacesExpiredHold: intent.id },
    });
  }

  throw new Error(`PaymentIntent ${intent.id} can't be charged (status ${intent.status}, no saved card to fall back on).`);
}

async function chargeSavedCard({
  bookingId,
  stripeCustomerId,
  stripePaymentMethodId,
  amountCents,
  label,
  reason,
  metadata = {},
}: {
  bookingId: string;
  stripeCustomerId: string;
  stripePaymentMethodId: string;
  amountCents: number;
  label: string;
  reason: string;
  metadata?: Record<string, string>;
}): Promise<string> {
  const charge = await getStripe().paymentIntents.create(
    {
      amount: amountCents,
      currency: "usd",
      customer: stripeCustomerId,
      payment_method: stripePaymentMethodId,
      off_session: true,
      confirm: true,
      metadata: { ...metadata, bookingId },
    },
    { idempotencyKey: `charge:${bookingId}:${stripePaymentMethodId}:${amountCents}` },
  );
  if (charge.status !== "succeeded") {
    throw new Error(`Off-session charge ${charge.id} (${reason}) ended as ${charge.status}.`);
  }
  console.log(`💳 [payment] ${reason}; charged $${(amountCents / 100).toFixed(2)} (${label}) off-session — intent ${charge.id}`);
  return charge.id;
}

/**
 * The card-holds job: places a booking's hold off-session on the card saved at booking. The
 * idempotency key covers a crash between Stripe and saving the result: the next try returns the
 * same hold instead of placing a second. A new card (or a new price) gets a new key.
 */
export async function placeOffSessionHold({
  bookingId,
  parentProfileId,
  stripeCustomerId,
  stripePaymentMethodId,
  amountCents,
}: {
  bookingId: string;
  parentProfileId: string;
  stripeCustomerId: string;
  stripePaymentMethodId: string;
  amountCents: number;
}) {
  const intent = await getStripe().paymentIntents.create(
    {
      amount: amountCents,
      currency: "usd",
      customer: stripeCustomerId,
      payment_method: stripePaymentMethodId,
      capture_method: "manual",
      off_session: true,
      confirm: true,
      metadata: { bookingId, parentProfileId },
    },
    { idempotencyKey: `hold:${bookingId}:${stripePaymentMethodId}:${amountCents}` },
  );
  if (intent.status !== "requires_capture") {
    throw new Error(`Off-session hold ${intent.id} ended as ${intent.status}.`);
  }
  console.log(`💳 [payment] Placed the scheduled hold of $${(amountCents / 100).toFixed(2)} — intent ${intent.id}`);
  return intent;
}

/**
 * Sorts a Stripe failure into the card's problem (declined, needs authentication, card removed:
 * the parent has to act, and trying again won't help) or a temporary one on Stripe's or our side
 * (network, rate limit, outage, our API key: try again next run, and don't email the parent).
 */
export function classifyStripeFailure(err: unknown): { kind: "CARD" | "TEMPORARY"; code: string } {
  const e = err as { type?: string; code?: string; decline_code?: string };
  const temporary = ["StripeConnectionError", "StripeAPIError", "StripeRateLimitError", "StripeAuthenticationError", "StripePermissionError"];
  if (e?.type && temporary.includes(e.type)) return { kind: "TEMPORARY", code: e.type };
  if (e?.type === "StripeCardError" || e?.type === "StripeInvalidRequestError") {
    return { kind: "CARD", code: (e.decline_code || e.code || e.type).slice(0, 60) };
  }
  // Not from Stripe at all (e.g. a hold that ended in an unexpected state): an admin should look.
  return { kind: "CARD", code: "unexpected" };
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
 * Booking more than 2 days ahead: the card is checked and saved now (with any bank
 * authentication), and the hold comes later. The booking route checks this SetupIntent belongs
 * to the parent and succeeded before saving its card on the booking.
 */
export async function createCardSetupIntent(stripeCustomerId: string, metadata: Record<string, string>) {
  return getStripe().setupIntents.create({
    customer: stripeCustomerId,
    payment_method_types: ["card"],
    usage: "off_session",
    metadata,
  });
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
