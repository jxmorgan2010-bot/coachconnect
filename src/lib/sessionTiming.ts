/**
 * When a parent may act on a booked session. Pure functions (no DB) so the dashboard
 * buttons and the API routes apply the same rules.
 *
 * - "Mark complete" opens at the session's scheduled end time.
 * - "Coach didn't show" opens NO_SHOW_GRACE_MINUTES after the scheduled start.
 *
 * Bookings are stored as UTC instants, so comparing instants is already correct for the
 * coach's Pacific schedule (DST included). Pacific only matters when showing the time.
 */
import { COACH_TIMEZONE, formatSlotLabel, toPacificParts } from "@/lib/availability";

export const NO_SHOW_GRACE_MINUTES = 15;

type Timed = { scheduledAt: Date; durationMinutes: number };

export function sessionEndsAt(b: Timed): Date {
  return new Date(b.scheduledAt.getTime() + b.durationMinutes * 60_000);
}

export function noShowOpensAt(b: Pick<Timed, "scheduledAt">): Date {
  return new Date(b.scheduledAt.getTime() + NO_SHOW_GRACE_MINUTES * 60_000);
}

export function canMarkComplete(b: Timed, now: Date = new Date()): boolean {
  return now.getTime() >= sessionEndsAt(b).getTime();
}

export function canReportNoShow(b: Pick<Timed, "scheduledAt">, now: Date = new Date()): boolean {
  return now.getTime() >= noShowOpensAt(b).getTime();
}

/** "5:30 PM PT", independent of the server's or browser's own timezone. */
export function formatPacificTime(instant: Date): string {
  return `${formatSlotLabel(toPacificParts(instant).minutes)} PT`;
}

/** "Oct 24, 4:30 PM PT", for emails and messages that name a session's date and time. */
export function formatPacificDateTime(instant: Date): string {
  const date = instant.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: COACH_TIMEZONE });
  return `${date}, ${formatPacificTime(instant)}`;
}
