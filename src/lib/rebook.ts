import { pacificWallTimeToUtc, toPacificParts } from "@/lib/availability";

/** A parent who's booked the same coach at least this many times gets priority rebooking. */
export const PRIORITY_REBOOK_THRESHOLD = 2;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Weekly repeats of `originalScheduledAt` for quick rebook: same weekday and same Pacific
 * clock time (so 4:30 PM stays 4:30 PM across a clock change), always at least one week
 * after the original — never the original itself, which may still be upcoming — and after
 * `from`. Returns the first `count` of them; a time that doesn't exist (the hour skipped
 * when clocks spring forward) is skipped.
 */
export function nextOccurrences(originalScheduledAt: Date, from: Date = new Date(), count = 4): Date[] {
  const { date, minutes } = toPacificParts(originalScheduledAt);
  const out: Date[] = [];
  // Jump close to `from` instead of walking week by week from an old session.
  let week = Math.max(1, Math.floor((from.getTime() - originalScheduledAt.getTime()) / WEEK_MS));
  while (out.length < count) {
    const candidate = pacificWallTimeToUtc(addDays(date, week * 7), minutes);
    if (candidate && candidate.getTime() > from.getTime()) out.push(candidate);
    week++;
  }
  return out;
}

/** The first of nextOccurrences: "same coach, same slot, next week" (or the next one still ahead). */
export function nextOccurrenceOf(originalScheduledAt: Date, from: Date = new Date()): Date {
  return nextOccurrences(originalScheduledAt, from, 1)[0];
}
