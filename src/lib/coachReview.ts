import { prisma } from "@/lib/prisma";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import { coachConsentStatus } from "@/lib/minorConsent";
import { getBackgroundCheckExpiryState, isCoachLive, isCoachProfileComplete } from "@/lib/coach";
import { areCoachOwnStepsDone } from "@/lib/onboardingSteps";

export type CoachReviewStatus = {
  coachProfileId: string;
  idApproved: boolean;
  /** The coach has finished every step they can do themselves (see lib/onboardingSteps.ts). */
  ownStepsDone: boolean;
  live: boolean;
  /**
   * Finished their part and waiting on an admin. False when suspended or when the background
   * check step lapsed, because those already have their own banners.
   */
  awaitingReview: boolean;
};

/** Where a coach stands in onboarding, read from the database. Null if the user has no coach profile. */
export async function getCoachReviewStatus(userId: string): Promise<CoachReviewStatus | null> {
  const profile = await prisma.coachProfile.findUnique({
    where: { userId },
    include: {
      user: { select: { isSuspended: true } },
      sports: { select: { id: true }, take: 1 },
      availability: { select: { id: true }, take: 1 },
    },
  });
  if (!profile) return null;

  let guardianConsentDone: boolean | null = null;
  if (ENABLE_MINOR_COACHES && profile.isMinorCoach) {
    const rows = await prisma.minorConsent.findMany({ where: { coachProfileId: profile.id } });
    guardianConsentDone = coachConsentStatus(rows).status === "COMPLETED";
  }

  const ownStepsDone = areCoachOwnStepsDone({
    profileComplete: isCoachProfileComplete(profile) && profile.sports.length > 0,
    hasAvailability: profile.availability.length > 0,
    hasIdPhoto: Boolean(profile.idPhotoPath),
    idStatus: profile.idVerificationStatus,
    hasProfilePhoto: Boolean(profile.profilePhotoUrl),
    conductAcknowledged: profile.conductAcknowledged,
    guardianConsentDone,
  });
  const live = isCoachLive(profile);

  return {
    coachProfileId: profile.id,
    idApproved: profile.idVerificationStatus === "APPROVED",
    ownStepsDone,
    live,
    awaitingReview:
      ownStepsDone &&
      !live &&
      !profile.isSuspended &&
      !profile.user.isSuspended &&
      getBackgroundCheckExpiryState(profile) !== "EXPIRED",
  };
}
