import type { CoachProfile, Sport, SchoolLevel } from "@/generated/prisma/client";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";

export type CoachCardData = {
  id: string;
  name: string;
  bio: string | null;
  schoolLevel: SchoolLevel | null;
  gradYear: number | null;
  hourlyRateCents: number | null;
  city: string | null;
  state: string | null;
  profilePhotoUrl: string | null;
  sports: Sport[];
  hasRecommendation: boolean;
  avgRating: number | null;
  reviewCount: number;
  videoVerified: boolean;
  isMinorCoach: boolean;
};

export const BACKGROUND_CHECK_VALIDITY_DAYS = 365;
export const BACKGROUND_CHECK_RENEWAL_WINDOW_DAYS = 30;
export const REPORT_SUSPEND_THRESHOLD = 3;

export function backgroundCheckExpiryDate(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + BACKGROUND_CHECK_VALIDITY_DAYS);
  return d;
}

export type BackgroundCheckExpiryState = "NONE" | "VALID" | "RENEWAL_NEEDED" | "EXPIRED";

/** Where a coach's background check stands relative to its 12-month expiry window. */
export function getBackgroundCheckExpiryState(
  profile: Pick<CoachProfile, "backgroundCheckStatus" | "backgroundCheckExpiresAt">,
  now: Date = new Date(),
): BackgroundCheckExpiryState {
  if (profile.backgroundCheckStatus !== "CLEAR" || !profile.backgroundCheckExpiresAt) return "NONE";
  const daysLeft = (profile.backgroundCheckExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysLeft <= 0) return "EXPIRED";
  if (daysLeft <= BACKGROUND_CHECK_RENEWAL_WINDOW_DAYS) return "RENEWAL_NEEDED";
  return "VALID";
}

/**
 * A coach is publicly visible/searchable only once ID + background check are
 * both approved, the background check hasn't lapsed past its 12-month
 * expiry, and the coach isn't suspended pending a reports review.
 */
export function isCoachLive(
  profile: Pick<
    CoachProfile,
    | "idVerificationStatus"
    | "backgroundCheckStatus"
    | "backgroundCheckExpiresAt"
    | "isSuspended"
    | "isMinorCoach"
    | "minorGuardianConsentedAt"
    | "minorBackgroundCheckNote"
  >,
  now: Date = new Date(),
) {
  if (profile.idVerificationStatus !== "APPROVED") return false;
  if (profile.isSuspended) return false;

  if (profile.isMinorCoach) {
    // Never live unless the flag is on — standard background checks don't gate a minor
    // coach (see MIN_MINOR_COACH_AGE docs below); guardian consent + an admin-recorded
    // alternative verification note stand in for it instead.
    if (!ENABLE_MINOR_COACHES) return false;
    return Boolean(profile.minorGuardianConsentedAt) && Boolean(profile.minorBackgroundCheckNote);
  }

  const expiryState = getBackgroundCheckExpiryState(profile, now);
  return expiryState === "VALID" || expiryState === "RENEWAL_NEEDED";
}

/** A coach with all three bio-video clips uploaded gets a "Video verified" trust badge. */
export function hasVerifiedVideoBio(
  profile: Pick<CoachProfile, "introClipUrl" | "coachingClipUrl" | "playingClipUrl">,
) {
  return Boolean(profile.introClipUrl && profile.coachingClipUrl && profile.playingClipUrl);
}

/** Minimum age to be routed into the Minor Coach flow at all — reject anyone younger. */
export const MIN_MINOR_COACH_AGE = 15.5;
export const MIN_ADULT_COACH_AGE = 18;

export function getAgeInYears(dateOfBirth: Date, now: Date = new Date()): number {
  const msPerYear = 1000 * 60 * 60 * 24 * 365.25;
  return (now.getTime() - dateOfBirth.getTime()) / msPerYear;
}

export type CoachAgeEligibility =
  | { ok: true; isMinor: boolean }
  | { ok: false; reason: string };

/**
 * Decides whether a date of birth clears the bar to sign up as a coach at all, and if so,
 * whether they land in the standard 18+ flow or the Minor Coach flow. The Minor Coach
 * branch only ever applies when ENABLE_MINOR_COACHES is on — otherwise anyone under 18 is
 * rejected outright, same as if the tier didn't exist.
 */
export function evaluateCoachAgeEligibility(dateOfBirth: Date, now: Date = new Date()): CoachAgeEligibility {
  const age = getAgeInYears(dateOfBirth, now);
  if (age >= MIN_ADULT_COACH_AGE) return { ok: true, isMinor: false };
  if (age < MIN_MINOR_COACH_AGE) {
    return { ok: false, reason: "Coaches must be at least 15.5 years old." };
  }
  if (!ENABLE_MINOR_COACHES) {
    return { ok: false, reason: "CoachConnect isn't accepting coaches under 18 yet. Please check back later." };
  }
  return { ok: true, isMinor: true };
}

export function isCoachProfileComplete(
  profile: Pick<
    CoachProfile,
    "bio" | "schoolLevel" | "schoolName" | "gradYear" | "hourlyRateCents" | "city" | "state"
  >,
) {
  return Boolean(
    profile.bio &&
      profile.schoolLevel &&
      profile.schoolName &&
      profile.gradYear &&
      profile.hourlyRateCents &&
      profile.city &&
      profile.state,
  );
}
