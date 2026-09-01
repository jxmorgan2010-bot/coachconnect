import type { CoachProfile, Sport, SchoolLevel } from "@/generated/prisma/client";

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
    "idVerificationStatus" | "backgroundCheckStatus" | "backgroundCheckExpiresAt" | "isSuspended"
  >,
  now: Date = new Date(),
) {
  if (profile.idVerificationStatus !== "APPROVED") return false;
  if (profile.isSuspended) return false;
  const expiryState = getBackgroundCheckExpiryState(profile, now);
  return expiryState === "VALID" || expiryState === "RENEWAL_NEEDED";
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
