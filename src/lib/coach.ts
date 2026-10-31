import type { CoachProfile, CoachType, Sport, SchoolLevel, SkillLevel } from "@/generated/prisma/client";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import { coachAgeBand, describeCalendarDate, todayInPacific, type CalendarDate } from "@/lib/age";

export type CoachCardData = {
  id: string;
  name: string;
  bio: string | null;
  coachType: CoachType;
  schoolLevel: SchoolLevel | null;
  gradYear: number | null;
  hourlyRateCents: number | null;
  city: string | null;
  state: string | null;
  profilePhotoUrl: string | null;
  sports: Sport[];
  /** Levels taken per sport, keyed by every sport in `sports`. */
  sportLevels: Partial<Record<Sport, SkillLevel[]>>;
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

/**
 * Coaches used to be able to run a placeholder background check on themselves; that
 * route stamped backgroundCheckRef with this prefix. Admin actions clear the ref, so a
 * CLEAR still carrying it was never marked by an admin and doesn't count.
 */
export const SELF_SERVE_CHECK_REF_PREFIX = "mock_bgc_";

export function isSelfServeBackgroundCheck(profile: Pick<CoachProfile, "backgroundCheckRef">): boolean {
  return Boolean(profile.backgroundCheckRef?.startsWith(SELF_SERVE_CHECK_REF_PREFIX));
}

/**
 * Where a coach's background check stands relative to its 12-month expiry window.
 * Only an admin-marked CLEAR counts (see SELF_SERVE_CHECK_REF_PREFIX).
 */
export function getBackgroundCheckExpiryState(
  profile: Pick<CoachProfile, "backgroundCheckStatus" | "backgroundCheckExpiresAt" | "backgroundCheckRef">,
  now: Date = new Date(),
): BackgroundCheckExpiryState {
  if (profile.backgroundCheckStatus !== "CLEAR" || !profile.backgroundCheckExpiresAt) return "NONE";
  if (isSelfServeBackgroundCheck(profile)) return "NONE";
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
    | "backgroundCheckRef"
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
  | { ok: false; code: "UNDER_18_NOT_ACCEPTED" | "TOO_YOUNG" | "EXPERIENCED_UNDER_18"; reason: string };

/**
 * Decides whether a date of birth clears the bar to sign up as a coach at all, and if so,
 * whether they land in the standard 18+ flow or the Minor Coach flow (calendar-date rules
 * in src/lib/age.ts). The Minor Coach branch only applies when ENABLE_MINOR_COACHES is on;
 * otherwise anyone under 18 gets UNDER_18_NOT_ACCEPTED, which signup shows as a friendly
 * notice rather than an error. Experienced coaches must be adults whatever the flag says: the
 * Minor Coach tier is for student-athletes only. today and minorCoachesEnabled default to the
 * real values and are parameters only so tests can pin them.
 */
export function evaluateCoachAgeEligibility(
  birth: CalendarDate,
  {
    today = todayInPacific(),
    minorCoachesEnabled = ENABLE_MINOR_COACHES,
    coachType = "STUDENT_ATHLETE",
  }: { today?: CalendarDate; minorCoachesEnabled?: boolean; coachType?: CoachType } = {},
): CoachAgeEligibility {
  const age = coachAgeBand(birth, today);
  if (age.band === "ADULT") return { ok: true, isMinor: false };
  if (coachType === "EXPERIENCED") {
    return {
      ok: false,
      code: "EXPERIENCED_UNDER_18",
      reason: `Experienced coaches need to be 18 or older. You can sign up as one on or after ${describeCalendarDate(age.adultOn)}.`,
    };
  }
  if (!minorCoachesEnabled) {
    return {
      ok: false,
      code: "UNDER_18_NOT_ACCEPTED",
      reason: `Thanks for wanting to coach! Assist Coaching isn't accepting coaches under 18 yet. You can sign up any time after your 18th birthday on ${describeCalendarDate(age.adultOn)}.`,
    };
  }
  if (age.band === "TOO_YOUNG") {
    return {
      ok: false,
      code: "TOO_YOUNG",
      reason: `Coaches need to be at least 16 years old. You can sign up on or after ${describeCalendarDate(age.eligibleOn)}.`,
    };
  }
  return { ok: true, isMinor: true };
}

/** Experienced coaches have no school fields, and their experience fields are optional. */
export function isCoachProfileComplete(
  profile: Pick<
    CoachProfile,
    "coachType" | "bio" | "schoolLevel" | "schoolName" | "gradYear" | "hourlyRateCents" | "city" | "state"
  >,
) {
  const shared = Boolean(profile.bio && profile.hourlyRateCents && profile.city && profile.state);
  if (profile.coachType === "EXPERIENCED") return shared;
  return shared && Boolean(profile.schoolLevel && profile.schoolName && profile.gradYear);
}
