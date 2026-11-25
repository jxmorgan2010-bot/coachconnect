import { prisma } from "@/lib/prisma";
import { sessionsLeft } from "@/lib/bundles";
import { cardLabel } from "@/lib/cardLabel";
import type { Sport } from "@/generated/prisma/client";

/**
 * How quick rebook pays (POST /api/bookings/quick-rebook): a session left in a package with
 * that coach, for the same sport and length, comes first. Only when there's none does it use a
 * saved card: the one from the booking being copied, or else the newest card the parent saved
 * on another booking or when buying a package. A card that isn't the copied booking's own is only
 * charged after the parent confirms it by name ("Visa ending 4242").
 */

/** The parent's oldest package with this coach, sport and length that still has a session left. */
export async function findRebookPackage(parentProfileId: string, coachProfileId: string, sport: Sport, durationMinutes: number) {
  const packages = await prisma.sessionPackage.findMany({
    where: { parentProfileId, coachProfileId, sport, durationMinutes, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  return packages.find((p) => sessionsLeft(p) > 0) ?? null;
}

/** What quick rebook needs to know about a saved card, from Stripe. */
export type SavedCardInfo = { customerId: string | null; brand: string | null; last4: string | null };

/** The card a package was paid with, from the package's PaymentIntent. */
export type PackageCardInfo = SavedCardInfo & { paymentMethodId: string };

/** Where a rebook card was saved: the booking being copied, another booking, or a package purchase. */
export type RebookCardSource = "PRIOR_BOOKING" | "OTHER_BOOKING" | "PACKAGE";

export type RebookCard = {
  paymentMethodId: string;
  /** "Visa ending 4242" */
  label: string;
  /** Anything but PRIOR_BOOKING needs the parent's confirmation first. */
  source: RebookCardSource;
};

// Other bookings' cards, and packages' cards, tried before giving up (this many of each). Bounds
// the Stripe lookups.
const OTHER_CARDS_TO_TRY = 3;

/**
 * The card to rebook with, or null when the parent has no saved card still on their Stripe
 * customer. `retrieveCard` and `retrievePackageCard` look cards up in Stripe (passed in so tests
 * can fake them); a card that's missing, or not on this parent's customer, is skipped. That also
 * skips packages bought before cards were saved at purchase: Stripe never put those cards on the
 * customer.
 */
export async function findRebookCard({
  parentProfileId,
  stripeCustomerId,
  priorBooking,
  retrieveCard,
  retrievePackageCard,
}: {
  parentProfileId: string;
  stripeCustomerId: string | null;
  priorBooking: { id: string; stripePaymentMethodId: string | null };
  retrieveCard: (paymentMethodId: string) => Promise<SavedCardInfo | null>;
  retrievePackageCard: (paymentIntentId: string) => Promise<PackageCardInfo | null>;
}): Promise<RebookCard | null> {
  if (!stripeCustomerId) return null;

  const priorCardId = priorBooking.stripePaymentMethodId;
  if (priorCardId) {
    const info = await retrieveCard(priorCardId).catch(() => null);
    if (info && info.customerId === stripeCustomerId) {
      return { paymentMethodId: priorCardId, label: cardLabel(info.brand, info.last4), source: "PRIOR_BOOKING" };
    }
  }

  const [bookings, packages] = await Promise.all([
    prisma.booking.findMany({
      where: { parentProfileId, id: { not: priorBooking.id }, stripePaymentMethodId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { stripePaymentMethodId: true, createdAt: true },
      take: 20,
    }),
    prisma.sessionPackage.findMany({
      where: { parentProfileId, stripePaymentIntentId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { stripePaymentIntentId: true, createdAt: true },
      take: OTHER_CARDS_TO_TRY,
    }),
  ]);
  const seen = new Set([priorCardId]);
  const bookingCards: { savedAt: Date; id: string; source: "OTHER_BOOKING" }[] = [];
  for (const b of bookings) {
    const id = b.stripePaymentMethodId!;
    if (seen.has(id) || bookingCards.length >= OTHER_CARDS_TO_TRY) continue;
    seen.add(id);
    bookingCards.push({ savedAt: b.createdAt, id, source: "OTHER_BOOKING" });
  }
  const packageCards = packages.map((p) => ({ savedAt: p.createdAt, id: p.stripePaymentIntentId!, source: "PACKAGE" as const }));

  const newestFirst = [...bookingCards, ...packageCards].sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime());
  for (const candidate of newestFirst) {
    if (candidate.source === "PACKAGE") {
      const info = await retrievePackageCard(candidate.id).catch(() => null);
      if (info && info.customerId === stripeCustomerId) {
        return { paymentMethodId: info.paymentMethodId, label: cardLabel(info.brand, info.last4), source: "PACKAGE" };
      }
    } else {
      const info = await retrieveCard(candidate.id).catch(() => null);
      if (info && info.customerId === stripeCustomerId) {
        return { paymentMethodId: candidate.id, label: cardLabel(info.brand, info.last4), source: "OTHER_BOOKING" };
      }
    }
  }
  return null;
}
