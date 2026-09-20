import { PLATFORM_FEE_RATE } from "@/lib/money";

/** "5 sessions for the price of 4.5" — configurable, not hardcoded into any route. */
export const BUNDLE_SESSION_COUNT = 5;
export const BUNDLE_DISCOUNT_PERCENT = 10;

/**
 * Pricing for a new package purchase, at the coach's current hourly rate and a chosen
 * session duration. Everything here gets snapshotted onto the SessionPackage row so a
 * later change to the discount constant (or the coach's rate) never alters a package
 * someone already bought.
 */
export function calculateBundlePricing(
  hourlyRateCents: number,
  durationMinutes: number,
  sessionCount: number = BUNDLE_SESSION_COUNT,
  discountPercent: number = BUNDLE_DISCOUNT_PERCENT,
) {
  const pricePerSessionCents = Math.round((hourlyRateCents * durationMinutes) / 60);
  const fullPriceCents = pricePerSessionCents * sessionCount;
  const totalChargedCents = Math.round(fullPriceCents * (1 - discountPercent / 100));
  return {
    pricePerSessionCents,
    sessionCount,
    discountPercent,
    fullPriceCents,
    totalChargedCents,
    savingsCents: fullPriceCents - totalChargedCents,
  };
}

/**
 * Per-session price breakdown for one booking drawn from a package — the discount is
 * spread evenly across every session in the bundle rather than re-derived from
 * totalChargedCents (which would drift under rounding across sessionsUsed increments).
 * Matches calculatePriceBreakdown()'s convention of computing the platform fee off the
 * full undiscounted price (the platform absorbs the bundle discount, not the coach —
 * same as how a referral credit doesn't shrink the coach's payout).
 */
export function perSessionBreakdown(pricePerSessionCents: number, discountPercent: number) {
  const priceCents = pricePerSessionCents;
  const discountCents = Math.round(pricePerSessionCents * (discountPercent / 100));
  const platformFeeCents = Math.round(priceCents * PLATFORM_FEE_RATE);
  return { priceCents, discountCents, platformFeeCents };
}
