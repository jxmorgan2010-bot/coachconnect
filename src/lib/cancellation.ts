/**
 * The cancellation policy, as pure functions (no DB, no Stripe) so the booking form, the
 * cancel dialogs and the API routes all apply the same rules.
 *
 * - A parent can cancel free until 11:59 PM Pacific the night before the session's day:
 *   the card hold is released (or the session goes back into their package).
 * - After that, until the session starts, a parent cancel is "late": the full price is
 *   charged (the hold is captured) and the coach is paid as if the session happened; a
 *   package session counts as used.
 * - A coach can cancel any time before the session ends, and the parent is never charged.
 *
 * Bookings are UTC instants; the deadline is computed from the session's Pacific calendar
 * date, so DST and the server's own timezone never move it.
 */
import { COACH_TIMEZONE, pacificWallTimeToUtc, toPacificParts } from "@/lib/availability";
import { sessionEndsAt } from "@/lib/sessionTiming";

export type ParentCancelOutcome = "FREE" | "LATE";

type Timed = { scheduledAt: Date; durationMinutes: number };

/**
 * The first instant a parent cancel is late: midnight Pacific at the start of the session's
 * day, i.e. just after 11:59 PM PT the night before. Midnight always exists in Pacific
 * (clocks change at 2 AM), so the conversion can't fail.
 */
export function freeCancelDeadline(scheduledAt: Date): Date {
  return pacificWallTimeToUtc(toPacificParts(scheduledAt).date, 0)!;
}

/** "Fri, Oct 23": the Pacific date of the night before the session, for "until 11:59 PM PT on …". */
export function freeCancelNightLabel(scheduledAt: Date): string {
  const lastFreeMinute = new Date(freeCancelDeadline(scheduledAt).getTime() - 60_000);
  return lastFreeMinute.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: COACH_TIMEZONE });
}

/** "Free cancellation until 11:59 PM PT on Fri, Oct 23" */
export function freeCancelPolicyText(scheduledAt: Date): string {
  return `Free cancellation until 11:59 PM PT on ${freeCancelNightLabel(scheduledAt)}`;
}

export function parentCancelOutcome(scheduledAt: Date, now: Date = new Date()): ParentCancelOutcome {
  return now.getTime() < freeCancelDeadline(scheduledAt).getTime() ? "FREE" : "LATE";
}

/** Parents can cancel until the session starts; after that it's a no-show or a completed session. */
export function canParentCancel(b: Pick<Timed, "scheduledAt">, now: Date = new Date()): boolean {
  return now.getTime() < b.scheduledAt.getTime();
}

/** Coaches can cancel any time before the session ends. */
export function canCoachCancel(b: Timed, now: Date = new Date()): boolean {
  return now.getTime() < sessionEndsAt(b).getTime();
}

/** What the parent pays for a booking: the session price less any referral credit or bundle discount. */
export function bookingChargeCents(b: { priceCents: number; discountCents: number }): number {
  return b.priceCents - b.discountCents;
}
