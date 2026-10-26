import type { CoachType, IdDocumentType, SchoolLevel } from "@/generated/prisma/client";
import { EXPERIENCED_COACHES_ENABLED } from "@/lib/features";

/**
 * The two kinds of coach and the IDs they verify with. Safe to import from client components.
 * Experienced coaches are behind EXPERIENCED_COACHES_ENABLED (src/lib/features.ts); whether one
 * can sign up is the switch's job, but a coach's type is permanent once set, so the rules here
 * (which ID, which profile fields) apply whatever the switch says.
 */

export const COACH_TYPES: readonly CoachType[] = ["STUDENT_ATHLETE", "EXPERIENCED"];

export const COACH_TYPE_LABELS: Record<CoachType, string> = {
  STUDENT_ATHLETE: "Student-athlete",
  EXPERIENCED: "Experienced coach",
};

/** Plural, for the search filter. */
export const COACH_TYPE_FILTER_LABELS: Record<CoachType, string> = {
  STUDENT_ATHLETE: "Student-athletes",
  EXPERIENCED: "Experienced coaches",
};

export function isCoachType(value: unknown): value is CoachType {
  return typeof value === "string" && (COACH_TYPES as readonly string[]).includes(value);
}

/**
 * The kind of coach, for the line under a coach's name. Student-athletes read exactly as they did
 * before experienced coaches existed. An experienced coach gets nothing while the switch is off,
 * so the site never calls them a school athlete or mentions the hidden type.
 */
export function coachKindLabel(
  coach: { coachType: CoachType; schoolLevel: SchoolLevel | null },
  { experiencedCoachesEnabled = EXPERIENCED_COACHES_ENABLED } = {},
): string | null {
  if (coach.coachType === "EXPERIENCED") return experiencedCoachesEnabled ? COACH_TYPE_LABELS.EXPERIENCED : null;
  return coach.schoolLevel === "COLLEGE" ? "College athlete" : coach.schoolLevel === "HIGH_SCHOOL" ? "High school athlete" : null;
}

/** What an experienced coach can upload. Student-athletes always upload a school ID. */
export const GOVERNMENT_ID_TYPES = ["DRIVERS_LICENSE", "STATE_ID", "PASSPORT"] as const satisfies readonly IdDocumentType[];
export type GovernmentIdType = (typeof GOVERNMENT_ID_TYPES)[number];

export const ID_DOCUMENT_LABELS: Record<IdDocumentType, string> = {
  SCHOOL_ID: "School ID",
  DRIVERS_LICENSE: "Driver's license",
  STATE_ID: "State ID",
  PASSPORT: "Passport",
};

export function isGovernmentIdType(value: unknown): value is GovernmentIdType {
  return typeof value === "string" && (GOVERNMENT_ID_TYPES as readonly string[]).includes(value);
}

/**
 * The label for a coach's stored ID. IDs uploaded before idDocumentType existed are all school
 * IDs (every coach was a student-athlete then), so NULL reads as one for student-athletes.
 */
export function idDocumentLabel(coach: { coachType: CoachType; idDocumentType: IdDocumentType | null }): string {
  if (coach.idDocumentType) return ID_DOCUMENT_LABELS[coach.idDocumentType];
  return coach.coachType === "STUDENT_ATHLETE" ? ID_DOCUMENT_LABELS.SCHOOL_ID : "Type not recorded";
}

// Limits for the experienced coach's optional, self-reported fields.
export const MAX_YEARS_COACHING = 60;
export const CERTIFICATIONS_MAX = 300;
export const PLAYING_HISTORY_MAX = 500;
