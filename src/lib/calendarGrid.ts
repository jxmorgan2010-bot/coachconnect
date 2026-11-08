/**
 * Date math for the Family page calendar, on Pacific calendar dates ("2026-11-08"). Pure and
 * browser-safe: the server works out each session's Pacific date, so the grid never depends on
 * the phone's own timezone, and arithmetic on whole dates in UTC can't be shifted by daylight saving.
 */

export function parseDate(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const { y, m, d } = parseDate(date);
  return fromUtc(Date.UTC(y, m - 1, d + days));
}

/** The first of the month `months` away from `date`'s month. */
export function addMonths(date: string, months: number): string {
  const { y, m } = parseDate(date);
  return fromUtc(Date.UTC(y, m - 1 + months, 1));
}

export function weekdayOfDate(date: string): number {
  const { y, m, d } = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The Sunday on or before `date`. */
export function startOfWeek(date: string): string {
  return addDays(date, -weekdayOfDate(date));
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** The 7-day week containing `date`, Sunday first. */
export function weekDates(date: string): string[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Whole weeks (Sunday first) covering `date`'s month: 4 to 6 rows of 7 dates. */
export function monthGrid(date: string): string[][] {
  const first = startOfMonth(date);
  const last = addDays(addMonths(first, 1), -1);
  const weeks: string[][] = [];
  for (let start = startOfWeek(first); start <= last; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  return weeks;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
export const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "November 2026" */
export function monthLabel(date: string): string {
  const { y, m } = parseDate(date);
  return `${MONTHS[m - 1]} ${y}`;
}

/** "Nov 8 – 14, 2026", or "Nov 29 – Dec 5, 2026" across months. */
export function weekLabel(date: string): string {
  const days = weekDates(date);
  const a = parseDate(days[0]);
  const b = parseDate(days[6]);
  const startText = `${MONTHS_SHORT[a.m - 1]} ${a.d}`;
  const endText = a.m === b.m ? `${b.d}` : `${MONTHS_SHORT[b.m - 1]} ${b.d}`;
  return a.y === b.y ? `${startText} – ${endText}, ${b.y}` : `${startText}, ${a.y} – ${endText}, ${b.y}`;
}

/** "Sunday, November 8" */
export function longDayLabel(date: string): string {
  const { m, d } = parseDate(date);
  return `${WEEKDAYS[weekdayOfDate(date)]}, ${MONTHS[m - 1]} ${d}`;
}
