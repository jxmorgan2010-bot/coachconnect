/** A parent who's booked the same coach at least this many times gets priority rebooking. */
export const PRIORITY_REBOOK_THRESHOLD = 2;

/**
 * The next future date/time that falls on the same weekday and time-of-day as
 * `originalScheduledAt` — used by quick rebook to propose "same coach, same slot, next
 * week" (or further out, if next week's slot has already passed by the time this runs).
 */
export function nextOccurrenceOf(originalScheduledAt: Date, from: Date = new Date()): Date {
  const candidate = new Date(originalScheduledAt);
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  if (candidate.getTime() <= from.getTime()) {
    const weeksElapsed = Math.ceil((from.getTime() - candidate.getTime()) / msPerWeek);
    candidate.setTime(candidate.getTime() + weeksElapsed * msPerWeek);
  }
  return candidate;
}
