import type { Sport } from "@/generated/prisma/client";
import { SPORT_LABELS, isSport } from "@/lib/sports";
import { toPacificParts } from "@/lib/availability";
import {
  coachAgeBand,
  compareCalendarDates,
  dateReachingAge,
  storedDateToCalendarDate,
  ADULT_AGE,
  type CalendarDate,
} from "@/lib/age";

/**
 * Teen interest list: while Assist Coaching takes 18+ coaches only (the Minor Coach tier is off,
 * src/lib/flags.ts), a 16- or 17-year-old who tries coach signup can leave their details instead.
 * No account is made. Kept: first name, email, sports, school, grad year, an optional parent or
 * guardian email (never emailed), and the date they turn 18 (not the date of birth), so admins can
 * see who's now old enough to invite as a regular coach. A link in the confirmation email deletes
 * the entry.
 *
 * Pure functions, safe in the browser. The database side and the removal token are in
 * src/lib/teenInterestStore.ts.
 */

/** A repeat signup with the same email sends at most one confirmation per this window. */
export const CONFIRMATION_RESEND_MS = 24 * 60 * 60 * 1000;

/** Grad years offered, relative to the current year: a 16–17-year-old may have just finished school. */
export const GRAD_YEAR_RANGE = { before: 1, after: 4 } as const;

export function gradYearOptions(currentYear: number): number[] {
  const years: number[] = [];
  for (let y = currentYear - GRAD_YEAR_RANGE.before; y <= currentYear + GRAD_YEAR_RANGE.after; y++) years.push(y);
  return years;
}

/** Ages 16–17 while the Minor Coach tier is off. Under 16 keeps the plain rejection; 18+ signs up normally. */
export function isTeenInterestAge(birth: CalendarDate, today: CalendarDate, minorCoachesEnabled: boolean): boolean {
  return !minorCoachesEnabled && coachAgeBand(birth, today).band === "MINOR";
}

/** Stored as UTC midnight of the calendar date, like CoachProfile.dateOfBirth. */
export function turns18OnFor(birth: CalendarDate): CalendarDate {
  return dateReachingAge(birth, ADULT_AGE);
}

export function hasTurned18(turns18On: Date, today: CalendarDate): boolean {
  return compareCalendarDates(today, storedDateToCalendarDate(turns18On)) >= 0;
}

export function formatSports(sports: Sport[]): string {
  return [...new Set(sports)].join(",");
}

export function parseSports(value: string): Sport[] {
  return value.split(",").filter(isSport);
}

export function sportLabels(value: string): string {
  return parseSports(value).map((s) => SPORT_LABELS[s]).join(", ");
}

// ---------------------------------------------------------------- CSV

export type TeenInterestCsvRow = {
  createdAt: Date;
  firstName: string;
  email: string;
  sports: string;
  school: string;
  gradYear: number;
  parentEmail: string | null;
  turns18On: Date;
  contactedAt: Date | null;
};

/** Moments (joined, contacted) as the Pacific calendar date. */
const pacificDay = (d: Date) => toPacificParts(d).date;
/** turns18On is already a calendar date, stored at UTC midnight. */
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * One CSV field. Quoted when needed, and a leading = + - @ (or tab/CR) gets a ' in front so a
 * spreadsheet doesn't run typed text as a formula.
 */
export function csvField(value: string | number | null): string {
  let s = value === null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function teenInterestCsv(rows: TeenInterestCsvRow[], today: CalendarDate): string {
  const header = ["Joined", "First name", "Email", "Sports", "School", "Grad year", "Parent/guardian email", "Turns 18", "Now 18+", "Contacted"];
  const lines = rows.map((r) =>
    [
      pacificDay(r.createdAt),
      r.firstName,
      r.email,
      sportLabels(r.sports),
      r.school,
      r.gradYear,
      r.parentEmail,
      ymd(r.turns18On),
      hasTurned18(r.turns18On, today) ? "yes" : "no",
      r.contactedAt ? pacificDay(r.contactedAt) : "",
    ]
      .map(csvField)
      .join(","),
  );
  return [header.join(","), ...lines].join("\r\n") + "\r\n";
}
