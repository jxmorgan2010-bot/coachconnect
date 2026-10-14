import type { IdVerificationStatus } from "@/generated/prisma/client";

/**
 * The onboarding steps a coach can finish on their own. Safe to import from client components,
 * so the onboarding checklist and the server (dashboard routing, "submitted" banners) agree on
 * when a coach has done their part.
 *
 * Steps only an admin can mark (approving the ID, the background check step, a minor's
 * background verification) aren't part of this: they never count against the coach's progress.
 */
export type CoachOwnStepsInput = {
  /** Profile fields filled in and at least one sport (see isCoachProfileComplete). */
  profileComplete: boolean;
  hasAvailability: boolean;
  hasIdPhoto: boolean;
  idStatus: IdVerificationStatus;
  hasProfilePhoto: boolean;
  conductAcknowledged: boolean;
  /** Parent/guardian consent, for minor coaches while the tier is on. Null for everyone else. */
  guardianConsentDone: boolean | null;
};

/**
 * The coach's part of "ID & profile photo": both uploaded. Approving the ID is the admin's part,
 * so a pending ID counts; a rejected one doesn't, because the coach has to upload a new one.
 */
export function isIdStepDone({ hasIdPhoto, idStatus, hasProfilePhoto }: Pick<CoachOwnStepsInput, "hasIdPhoto" | "idStatus" | "hasProfilePhoto">): boolean {
  return hasIdPhoto && hasProfilePhoto && idStatus !== "REJECTED";
}

/** True once every step the coach can do themselves is done, so their profile is ready for admin review. */
export function areCoachOwnStepsDone(input: CoachOwnStepsInput): boolean {
  return (
    input.profileComplete &&
    input.hasAvailability &&
    input.guardianConsentDone !== false &&
    isIdStepDone(input) &&
    input.conductAcknowledged
  );
}
