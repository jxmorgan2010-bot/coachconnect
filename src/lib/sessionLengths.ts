/**
 * The only session lengths that can be booked or bought as a package. Older bookings and
 * packages may have other lengths; they keep them (and lengthLabel still names them).
 */
import { calculatePriceBreakdown } from "@/lib/money";
import { calculateBundlePricing } from "@/lib/bundles";

export const SESSION_LENGTHS = [45, 60, 75] as const;
export type SessionLength = (typeof SESSION_LENGTHS)[number];

export const DEFAULT_SESSION_LENGTH: SessionLength = 60;

/** Lengths that could be bought before these three; a package bought then keeps its length. */
export const LEGACY_PACKAGE_LENGTHS = [30, 90, 120] as const;

export const LENGTH_NOT_ALLOWED_MESSAGE = "Sessions can be 45 minutes, 1 hour, or 1 hour 15 minutes.";

export function isAllowedLength(minutes: number): minutes is SessionLength {
  return (SESSION_LENGTHS as readonly number[]).includes(minutes);
}

/** "45 min", "1 hour", "1 hour 15 min" — and any older length, e.g. "90 min" → "1 hour 30 min". */
export function lengthLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = hours === 1 ? "1 hour" : `${hours} hours`;
  return rest ? `${h} ${rest} min` : h;
}

/** Each allowed length with what one session costs at this hourly rate (rate × length). */
export function lengthOptions(hourlyRateCents: number) {
  return SESSION_LENGTHS.map((minutes) => ({
    minutes,
    label: lengthLabel(minutes),
    priceCents: calculatePriceBreakdown(hourlyRateCents, minutes).sessionCostCents,
  }));
}

/** Each allowed length with its package price (5 × the session price, less the bundle discount). */
export function packageLengthOptions(hourlyRateCents: number) {
  return SESSION_LENGTHS.map((minutes) => ({
    minutes,
    label: lengthLabel(minutes),
    pricing: calculateBundlePricing(hourlyRateCents, minutes),
  }));
}
