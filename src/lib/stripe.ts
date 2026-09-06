import Stripe from "stripe";

let _stripe: Stripe | null = null;

/** Lazily constructed so routes that don't touch payments never require the env var. */
export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set — add your Stripe test-mode secret key to .env.");
    }
    _stripe = new Stripe(key);
  }
  return _stripe;
}
