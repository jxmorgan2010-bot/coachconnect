import type { CoachProfile, Sport, SchoolLevel } from "@/generated/prisma/client";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import { coachAgeBand, describeCalendarDate, todayInPacific, type CalendarDate } from "@/lib/age";

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
  lifetimePoints: number;
  priorBookingCount: number;
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
 * expiry, the coach isn't suspended pending a reports review, and their
 * account isn't suspended under the contact-sharing policy. `user` is
 * required so no caller can forget to load the account.
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
  > & { user: { isSuspended: boolean } },
  now: Date = new Date(),
) {
  if (profile.idVerificationStatus !== "APPROVED") return false;
  if (profile.isSuspended) return false;
  if (profile.user.isSuspended) return false;

  if (profile.isMinorCoach) {
    // Never live unless the flag is on — standard background checks don't gate a minor
    // coach; guardian consent + an admin-recorded alternative verification note stand in
    // for it instead. minorGuardianConsentedAt is cleared when consent is revoked (see
    // src/lib/minorConsent.ts), which unpublishes the profile.
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

export type CoachAgeEligibility =
  | { ok: true; isMinor: boolean }
  | { ok: false; code: "UNDER_18_NOT_ACCEPTED" | "TOO_YOUNG"; reason: string };

/**
 * Decides whether a date of birth clears the bar to sign up as a coach at all, and if so,
 * whether they land in the standard 18+ flow or the Minor Coach flow (calendar-date rules
 * in src/lib/age.ts). The Minor Coach branch only applies when ENABLE_MINOR_COACHES is on;
 * otherwise anyone under 18 gets UNDER_18_NOT_ACCEPTED, which signup shows as a friendly
 * notice rather than an error. Both inputs default to the real values and are parameters
 * only so tests can pin them.
 */
export function evaluateCoachAgeEligibility(
  birth: CalendarDate,
  { today = todayInPacific(), minorCoachesEnabled = ENABLE_MINOR_COACHES }: { today?: CalendarDate; minorCoachesEnabled?: boolean } = {},
): CoachAgeEligibility {
  const age = coachAgeBand(birth, today);
  if (age.band === "ADULT") return { ok: true, isMinor: false };
  if (!minorCoachesEnabled) {
    return {
      ok: false,
      code: "UNDER_18_NOT_ACCEPTED",
      reason: `Thanks for wanting to coach! CoachConnect isn't accepting coaches under 18 yet. You can sign up any time after your 18th birthday on ${describeCalendarDate(age.adultOn)}.`,
    };
  }
  if (age.band === "TOO_YOUNG") {
    return {
      ok: false,
      code: "TOO_YOUNG",
      reason: `Coaches need to be at least 15 years and 6 months old. You can sign up on or after ${describeCalendarDate(age.eligibleOn)}.`,
    };
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
