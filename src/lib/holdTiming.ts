/**
 * When a single session's card hold is placed. Pure functions (no DB, no Stripe) so the booking
 * form, the emails and the card-holds job (src/lib/cardHolds.ts) all apply the same rules.
 *
 * - Booked more than HOLD_LEAD_HOURS ahead: the card is checked and saved at booking (any bank
 *   authentication happens then) with no hold. The job places the hold HOLD_LEAD_HOURS before
 *   the session.
 * - Booked HOLD_LEAD_HOURS or less ahead: the hold is placed at booking.
 * - If the job can't place the hold, the parent is emailed to update their card. If there's still
 *   no hold HOLD_FIX_HOURS before the session, the booking is cancelled and the parent isn't
 *   charged.
 *
 * Packages are charged in full at purchase and never use any of this.
 */

export const HOLD_LEAD_HOURS = 48;
export const HOLD_FIX_HOURS = 12;

const HOUR = 60 * 60 * 1000;

/** When the job places the hold for a session booked further ahead than HOLD_LEAD_HOURS. */
export function holdDueAt(scheduledAt: Date): Date {
  return new Date(scheduledAt.getTime() - HOLD_LEAD_HOURS * HOUR);
}

/** True when the hold is placed at booking, false when the card is only saved then. */
export function holdsAtBooking(scheduledAt: Date, now: Date = new Date()): boolean {
  return now.getTime() >= holdDueAt(scheduledAt).getTime();
}

/** After this, a booking whose hold still failed is cancelled. */
export function holdFixDeadline(scheduledAt: Date): Date {
  return new Date(scheduledAt.getTime() - HOLD_FIX_HOURS * HOUR);
}

/** Booking.cancelReason when the card-holds job cancels (admin-facing; parents see their own wording). */
export const HOLD_NOT_FIXED_REASON = "Card hold failed and the card wasn't updated in time";

/** The state of a single session's card before it's charged, for the dashboards. */
export function holdState(b: {
  packageId: string | null;
  stripePaymentIntentId: string | null;
  holdDueAt: Date | null;
  holdFailedAt: Date | null;
}): "HELD" | "SAVED" | "FAILED" | "NONE" {
  if (b.packageId) return "NONE";
  if (b.stripePaymentIntentId) return "HELD";
  if (b.holdFailedAt) return "FAILED";
  if (b.holdDueAt) return "SAVED";
  return "NONE";
}
