import { toPacificParts } from "@/lib/availability";

/**
 * Calendar-date age math for coach signup. Pure functions (no DB, no flags) so the rules
 * can be tested at the exact boundaries.
 *
 * Ages are compared as calendar dates, never as decimal years: someone reaches 18 on
 * their 18th birthday, and "today" is the calendar date in Pacific time (all coaches are
 * in the Bay Area), whatever timezone the server runs in.
 *
 * When an anniversary lands on a day the target month doesn't have (a Feb 29 birthday in
 * a non-leap year, or Aug 31 plus six months), it moves to the 1st of the next month.
 * That's the later of the two common conventions, so in both directions it errs toward
 * caution: someone becomes old enough to apply one day later, and stays in the Minor
 * Coach flow (with its extra safeguards) one day longer.
 */

/** A date with no time or timezone. month is 1–12. */
export type CalendarDate = { year: number; month: number; day: number };

/** Minimum age to apply as a coach at all (only possible while the Minor Coach tier is on). */
export const MIN_COACH_AGE = { years: 15, months: 6 } as const;
/** From this age a coach is in the standard adult flow. */
export const ADULT_AGE = { years: 18, months: 0 } as const;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Parses "YYYY-MM-DD" (what <input type="date"> sends). Null for anything malformed or not a real date. */
export function parseCalendarDate(value: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function formatCalendarDate(d: CalendarDate): string {
  return `${String(d.year).padStart(4, "0")}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

/** "March 1, 2027" — for messages to applicants. */
export function describeCalendarDate(d: CalendarDate): string {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Dates of birth are stored as UTC midnight of the calendar date. */
export function calendarDateToStoredDate(d: CalendarDate): Date {
  return new Date(Date.UTC(d.year, d.month - 1, d.day));
}

export function storedDateToCalendarDate(date: Date): CalendarDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** Today's calendar date in Pacific time. */
export function todayInPacific(now: Date = new Date()): CalendarDate {
  return parseCalendarDate(toPacificParts(now).date)!;
}

export function compareCalendarDates(a: CalendarDate, b: CalendarDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** The date someone born on `birth` reaches the given age (see the rollover rule above). */
export function dateReachingAge(birth: CalendarDate, age: { years: number; months: number }): CalendarDate {
  const monthIndex = birth.month - 1 + age.months;
  const year = birth.year + age.years + Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  if (birth.day <= daysInMonth(year, month)) return { year, month, day: birth.day };
  return month === 12 ? { year: year + 1, month: 1, day: 1 } : { year, month: month + 1, day: 1 };
}

export function hasReachedAge(birth: CalendarDate, age: { years: number; months: number }, today: CalendarDate): boolean {
  return compareCalendarDates(today, dateReachingAge(birth, age)) >= 0;
}

/** Completed years of age on `today` (same rollover rule). */
export function ageInWholeYears(birth: CalendarDate, today: CalendarDate): number {
  let years = today.year - birth.year;
  if (years > 0 && !hasReachedAge(birth, { years, months: 0 }, today)) years -= 1;
  return Math.max(0, years);
}

export type CoachAgeBand =
  | { band: "TOO_YOUNG"; eligibleOn: CalendarDate; adultOn: CalendarDate }
  | { band: "MINOR"; adultOn: CalendarDate }
  | { band: "ADULT" };

/** Which signup flow a date of birth belongs in, on a given Pacific calendar date. */
export function coachAgeBand(birth: CalendarDate, today: CalendarDate): CoachAgeBand {
  const adultOn = dateReachingAge(birth, ADULT_AGE);
  if (compareCalendarDates(today, adultOn) >= 0) return { band: "ADULT" };
  const eligibleOn = dateReachingAge(birth, MIN_COACH_AGE);
  if (compareCalendarDates(today, eligibleOn) < 0) return { band: "TOO_YOUNG", eligibleOn, adultOn };
  return { band: "MINOR", adultOn };
}
