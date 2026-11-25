import type { Sport } from "@/generated/prisma/client";
import type { calculateBundlePricing } from "@/lib/bundles";

/**
 * What a package purchase writes on its Stripe PaymentIntent, and how it's recognised again. No
 * database, no Stripe calls (src/lib/packagePurchase.ts does the delivering).
 *
 * What was bought is written when the PaymentIntent is created, so a coach changing their rate
 * mid-purchase can't leave a parent charged with no package. Only our server can write metadata.
 */

const PACKAGE_KIND = "SESSION_PACKAGE";

type BundlePricing = ReturnType<typeof calculateBundlePricing>;

export function packageMetadata(p: {
  parentProfileId: string;
  coachProfileId: string;
  sport: Sport;
  durationMinutes: number;
  pricing: BundlePricing;
}): Record<string, string> {
  return {
    kind: PACKAGE_KIND,
    parentProfileId: p.parentProfileId,
    coachProfileId: p.coachProfileId,
    sport: p.sport,
    durationMinutes: String(p.durationMinutes),
    sessionCount: String(p.pricing.sessionCount),
    pricePerSessionCents: String(p.pricing.pricePerSessionCents),
    discountPercent: String(p.pricing.discountPercent),
  };
}

/** The parts of a Stripe PaymentIntent this needs (latest_charge must be expanded). */
export type PackageIntent = {
  id: string;
  status: string;
  amount: number;
  metadata: Record<string, string> | null;
  latest_charge: string | { amount_refunded: number } | null;
};

export type DeliveryResult =
  | { status: "CREATED" | "EXISTING"; packageId: string }
  // Not a package payment at all (a session hold, a tip...).
  | { status: "NOT_A_PACKAGE" }
  | { status: "NOT_PAID" }
  // Refunded in full before it was delivered.
  | { status: "REFUNDED" }
  // Paid, but there's no package to make from it. Someone has to look.
  | { status: "UNDELIVERABLE"; reason: string };

/** True for package payments, including ones created before `kind` was recorded. */
export function isPackageIntent(metadata: Record<string, string> | null): boolean {
  if (!metadata) return false;
  if (metadata.kind) return metadata.kind === PACKAGE_KIND;
  return !!(metadata.parentProfileId && metadata.coachProfileId && metadata.sport && metadata.durationMinutes);
}
