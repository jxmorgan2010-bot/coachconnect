import type { BookingStatus } from "@/generated/prisma/client";

/**
 * The coach's private booking history on /dashboard/profile. Upcoming: sessions still ahead and
 * still on. Past: everything else, including cancelled sessions whose date hasn't come yet.
 */

export const BOOKING_HISTORY_PAGE_SIZE = 20;

const ACTIVE_STATUSES: BookingStatus[] = ["CONFIRMED", "PENDING_CONSENT"];

export function upcomingWhere(coachProfileId: string, now: Date) {
  return { coachProfileId, status: { in: ACTIVE_STATUSES }, scheduledAt: { gte: now } };
}

export function pastWhere(coachProfileId: string, now: Date) {
  return {
    coachProfileId,
    OR: [{ scheduledAt: { lt: now } }, { status: { notIn: ACTIVE_STATUSES } }],
  };
}

export type HistoryStatus = { label: string; variant: "success" | "accent" | "warning" | "neutral" };

export function bookingHistoryStatus(status: BookingStatus, scheduledAt: Date, now: Date): HistoryStatus {
  switch (status) {
    case "COMPLETED":
      return { label: "Completed", variant: "success" };
    case "CANCELLED":
      return { label: "Cancelled", variant: "neutral" };
    case "PENDING_CONSENT":
      return { label: "Pending", variant: "warning" };
    case "CONFIRMED":
      return scheduledAt < now
        ? { label: "Waiting for the parent to mark it complete", variant: "warning" }
        : { label: "Booked", variant: "accent" };
  }
}

/** Page 1 when the query value is missing or isn't a positive whole number. */
export function parsePage(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
