import { prisma } from "@/lib/prisma";
import { sessionsLeft } from "@/lib/bundles";
import { cardLabel } from "@/lib/cardLabel";
import type { Sport } from "@/generated/prisma/client";

/**
 * How quick rebook pays (POST /api/bookings/quick-rebook): a session left in a package with
 * that coach, for the same sport and length, comes first. Only when there's none does it use a
 * saved card: the one from the booking being copied, or else the newest card the parent saved
 * on another booking. A card from another booking is only charged after the parent confirms it
 * by name ("Visa ending 4242").
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

export type RebookCard = {
  paymentMethodId: string;
  /** "Visa ending 4242" */
  label: string;
  /** True when the card was saved on a different booking than the one being rebooked. */
  fromOtherBooking: boolean;
};

// Other bookings' cards tried, newest first, before giving up. Bounds the Stripe lookups.
const OTHER_CARDS_TO_TRY = 3;

/**
 * The card to rebook with, or null when the parent has no saved card still on their Stripe
 * customer. `retrieveCard` looks a card up in Stripe (passed in so tests can fake it); a card
 * that's missing, or no longer on this parent's customer, is skipped.
 */
export async function findRebookCard({
  parentProfileId,
  stripeCustomerId,
  priorBooking,
  retrieveCard,
}: {
  parentProfileId: string;
  stripeCustomerId: string | null;
  priorBooking: { id: string; stripePaymentMethodId: string | null };
  retrieveCard: (paymentMethodId: string) => Promise<SavedCardInfo | null>;
}): Promise<RebookCard | null> {
  if (!stripeCustomerId) return null;

  const others = await prisma.booking.findMany({
    where: { parentProfileId, id: { not: priorBooking.id }, stripePaymentMethodId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { stripePaymentMethodId: true },
    take: 20,
  });
  const otherIds = [...new Set(others.map((b) => b.stripePaymentMethodId!))]
    .filter((id) => id !== priorBooking.stripePaymentMethodId)
    .slice(0, OTHER_CARDS_TO_TRY);

  const candidates = [
    ...(priorBooking.stripePaymentMethodId ? [{ id: priorBooking.stripePaymentMethodId, fromOtherBooking: false }] : []),
    ...otherIds.map((id) => ({ id, fromOtherBooking: true })),
  ];
  for (const candidate of candidates) {
    const info = await retrieveCard(candidate.id).catch(() => null);
    if (info && info.customerId === stripeCustomerId) {
      return { paymentMethodId: candidate.id, label: cardLabel(info.brand, info.last4), fromOtherBooking: candidate.fromOtherBooking };
    }
  }
  return null;
}
