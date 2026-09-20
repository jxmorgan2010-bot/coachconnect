import type { Prisma, PointsActionType } from "@/generated/prisma/client";

/** Point values per activity — parents and coaches both earn on session completion. */
export const POINTS_SESSION_COMPLETED = 50;
export const POINTS_REVIEW_LEFT = 20;
export const POINTS_REFERRAL_SIGNUP = 100;
export const POINTS_QUICK_REBOOK = 10;

/** How many points redeem for $1 of booking credit (added to ParentProfile.creditCents). */
export const POINTS_PER_DOLLAR_REDEMPTION = 100;

/** Lifetime points a coach needs to cross to show the "Top Coach" profile badge. */
export const TOP_COACH_POINTS_THRESHOLD = 500;

export function pointsToCreditCents(points: number): number {
  return Math.floor((points / POINTS_PER_DOLLAR_REDEMPTION) * 100);
}

export function isTopCoach(lifetimePoints: number): boolean {
  return lifetimePoints >= TOP_COACH_POINTS_THRESHOLD;
}

type AwardPointsInput = {
  parentProfileId?: string;
  coachProfileId?: string;
  action: PointsActionType;
  points: number;
  bookingId?: string;
};

/**
 * Records a points transaction and updates the balance, inside the caller's own
 * transaction (this never opens its own — every call site already wraps the triggering
 * write, e.g. marking a session complete, in a $transaction). Exactly one of
 * parentProfileId/coachProfileId must be set. `points` may be negative (a redemption).
 */
export async function awardPoints(
  tx: Prisma.TransactionClient,
  { parentProfileId, coachProfileId, action, points, bookingId }: AwardPointsInput,
) {
  if (!parentProfileId && !coachProfileId) {
    throw new Error("awardPoints requires either a parentProfileId or coachProfileId.");
  }

  await tx.pointsTransaction.create({
    data: { parentProfileId, coachProfileId, action, points, bookingId },
  });

  if (parentProfileId) {
    await tx.parentProfile.update({
      where: { id: parentProfileId },
      data: { pointsBalance: { increment: points } },
    });
  }

  if (coachProfileId) {
    await tx.coachProfile.update({
      where: { id: coachProfileId },
      data: {
        pointsBalance: { increment: points },
        ...(points > 0 ? { lifetimePoints: { increment: points } } : {}),
      },
    });
  }
}
