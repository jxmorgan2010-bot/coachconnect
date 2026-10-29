import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { awardPoints, POINTS_REFERRAL_SIGNUP } from "@/lib/points";
import { Prisma, type ReferralOutcome } from "@/generated/prisma/client";

// Given to both parents once the referred parent's first session is completed and paid. It is
// stored on each parent profile as it is earned, so changing it never alters credit already
// handed out.
export const REFERRAL_BONUS_CENTS = 500; // $5

export function generateReferralCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

/** The Stripe reads settleReferral needs, injectable so database tests don't call Stripe. */
export type CardLookups = {
  /** Stripe's fingerprint for the card behind a PaymentMethod (preferred) or PaymentIntent. */
  cardFingerprint(ref: { paymentMethodId: string | null; paymentIntentId: string | null }): Promise<string | null>;
  /** Fingerprints of every card saved on a Stripe customer. */
  customerCardFingerprints(customerId: string): Promise<string[]>;
};

export const stripeCardLookups: CardLookups = {
  async cardFingerprint({ paymentMethodId, paymentIntentId }) {
    const stripe = getStripe();
    let pmId = paymentMethodId;
    if (!pmId && paymentIntentId) {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
      pmId = typeof intent.payment_method === "string" ? intent.payment_method : (intent.payment_method?.id ?? null);
    }
    if (!pmId) return null;
    const pm = await stripe.paymentMethods.retrieve(pmId);
    return pm.card?.fingerprint ?? null;
  },
  async customerCardFingerprints(customerId) {
    const cards = await getStripe().customers.listPaymentMethods(customerId, { type: "card", limit: 100 });
    return cards.data.map((pm) => pm.card?.fingerprint).filter((f): f is string => !!f);
  },
};

/**
 * Decides a pending referral when the referred parent's session is completed (marked complete
 * or auto-released). Only a session that was paid by card counts: a card hold that was
 * captured, or a session drawn from a package bought by card. A session fully covered by
 * credit leaves the referral pending for the next one.
 *
 * The first counted session settles the referral for good:
 * - SELF_REFERRAL when the card is saved on the referrer's own Stripe customer,
 * - DUPLICATE_CARD when the card already earned a referral reward,
 * - otherwise GRANTED: both parents get REFERRAL_BONUS_CENTS and the referrer gets the
 *   referral points.
 * Returns the outcome, or null when there was nothing to decide yet.
 */
export async function settleReferral(bookingId: string, lookups: CardLookups = stripeCardLookups): Promise<ReferralOutcome | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      parentProfile: { include: { referredBy: { select: { id: true, stripeCustomerId: true } } } },
      package: { select: { stripePaymentIntentId: true } },
    },
  });
  if (!booking || booking.status !== "COMPLETED" || booking.paymentStatus !== "CAPTURED") return null;
  const parent = booking.parentProfile;
  if (!parent.referralPending) return null;

  const card = booking.stripePaymentIntentId
    ? { paymentMethodId: booking.stripePaymentMethodId, paymentIntentId: booking.stripePaymentIntentId }
    : booking.package?.stripePaymentIntentId
      ? { paymentMethodId: null, paymentIntentId: booking.package.stripePaymentIntentId }
      : null;
  if (!card) return null;

  const referrer = parent.referredBy;
  if (!referrer) {
    // The referrer's account is gone, so there's no one to pair the reward with.
    await prisma.parentProfile.update({ where: { id: parent.id }, data: { referralPending: false } });
    return null;
  }

  const fingerprint = await lookups.cardFingerprint(card);
  if (!fingerprint) {
    throw new Error(`No card fingerprint for booking ${booking.id}; referral left pending.`);
  }

  let outcome: ReferralOutcome = "GRANTED";
  if (referrer.stripeCustomerId && (await lookups.customerCardFingerprints(referrer.stripeCustomerId)).includes(fingerprint)) {
    outcome = "SELF_REFERRAL";
  } else if (await prisma.referralReward.findUnique({ where: { cardFingerprint: fingerprint } })) {
    outcome = "DUPLICATE_CARD";
  }

  try {
    return await recordReferralOutcome({ parentId: parent.id, referrerId: referrer.id, bookingId: booking.id, outcome, fingerprint });
  } catch (err) {
    // Another account with the same card was granted between the check above and this write.
    if (outcome === "GRANTED" && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return recordReferralOutcome({ parentId: parent.id, referrerId: referrer.id, bookingId: booking.id, outcome: "DUPLICATE_CARD", fingerprint });
    }
    throw err;
  }
}

async function recordReferralOutcome({
  parentId,
  referrerId,
  bookingId,
  outcome,
  fingerprint,
}: {
  parentId: string;
  referrerId: string;
  bookingId: string;
  outcome: ReferralOutcome;
  fingerprint: string;
}): Promise<ReferralOutcome | null> {
  const granted = outcome === "GRANTED";
  return prisma.$transaction(async (tx) => {
    // Guarded on referralPending: two sessions completing at once settle the referral once.
    const { count } = await tx.parentProfile.updateMany({
      where: { id: parentId, referralPending: true },
      data: { referralPending: false },
    });
    if (count !== 1) return null;

    await tx.referralReward.create({
      data: {
        referredParentId: parentId,
        referrerParentId: referrerId,
        bookingId,
        outcome,
        cardFingerprint: granted ? fingerprint : null,
        creditCents: granted ? REFERRAL_BONUS_CENTS : 0,
      },
    });
    if (granted) {
      await tx.parentProfile.update({ where: { id: parentId }, data: { creditCents: { increment: REFERRAL_BONUS_CENTS } } });
      await tx.parentProfile.update({ where: { id: referrerId }, data: { creditCents: { increment: REFERRAL_BONUS_CENTS } } });
      await awardPoints(tx, { parentProfileId: referrerId, action: "REFERRAL_SIGNUP", points: POINTS_REFERRAL_SIGNUP });
    }
    return outcome;
  });
}

/**
 * Runs settleReferral after a session is completed without letting it fail the completion:
 * the session and its charge already went through. A Stripe error leaves the referral
 * pending, so it's decided at the parent's next completed session.
 */
export async function settleReferralAfterCompletion(bookingId: string) {
  try {
    const outcome = await settleReferral(bookingId);
    if (outcome) console.log(`🎁 [referral] Booking ${bookingId}: ${outcome}`);
  } catch (err) {
    console.error(`Referral check failed for booking ${bookingId}; it stays pending`, err);
  }
}
