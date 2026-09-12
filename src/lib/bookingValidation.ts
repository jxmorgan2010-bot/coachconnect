import { prisma } from "@/lib/prisma";
import { isCoachLive } from "@/lib/coach";
import { calculatePriceBreakdown } from "@/lib/money";
import { rangesOverlap } from "@/lib/bookingConflicts";
import type { ParentProfile, Sport } from "@/generated/prisma/client";

export class BookingValidationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type BookingRequestInput = {
  coachProfileId: string;
  childId: string;
  sport: string;
  scheduledAt: Date;
  durationMinutes: number;
  secondAdultName?: string;
};

/**
 * Shared validation + pricing for a prospective booking, used both when creating the
 * Stripe PaymentIntent (before the card is charged) and again when the booking row is
 * actually created (to close the race window and never trust client-supplied pricing).
 */
export async function validateBookingRequest(parentProfile: ParentProfile, data: BookingRequestInput) {
  const child = await prisma.child.findUnique({ where: { id: data.childId } });
  if (!child || child.parentProfileId !== parentProfile.id) {
    throw new BookingValidationError("Select a valid child on your account.");
  }

  const coach = await prisma.coachProfile.findUnique({
    where: { id: data.coachProfileId },
    include: { sports: true },
  });
  if (!coach || !isCoachLive(coach) || !coach.hourlyRateCents) {
    throw new BookingValidationError("This coach isn't available for booking right now.");
  }
  if (!coach.sports.some((s) => s.sport === data.sport)) {
    throw new BookingValidationError("This coach doesn't offer that sport.");
  }

  // Sessions with a minor coach require a second adult present beyond the booking parent.
  if (coach.isMinorCoach && !data.secondAdultName?.trim()) {
    throw new BookingValidationError("This coach is under 18 — enter the name of a second adult who'll be present.");
  }

  const activeBookings = await prisma.booking.findMany({
    where: { coachProfileId: coach.id, status: { in: ["CONFIRMED", "COMPLETED"] } },
    select: { scheduledAt: true, durationMinutes: true },
  });
  const hasConflict = activeBookings.some((b) =>
    rangesOverlap(data.scheduledAt, data.durationMinutes, b.scheduledAt, b.durationMinutes),
  );
  if (hasConflict) {
    throw new BookingValidationError("That time was just booked by someone else. Pick another time.", 409);
  }

  const breakdown = calculatePriceBreakdown(coach.hourlyRateCents, data.durationMinutes);
  const discountCents = Math.min(parentProfile.creditCents, breakdown.sessionCostCents);
  const totalDueCents = breakdown.totalChargedCents - discountCents;

  const priorBookingCount = await prisma.booking.count({
    where: { parentProfileId: parentProfile.id, coachProfileId: coach.id },
  });
  const isFirstSession = priorBookingCount === 0;

  return { child, coach, sport: data.sport as Sport, breakdown, discountCents, totalDueCents, isFirstSession };
}
