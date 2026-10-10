import { prisma } from "@/lib/prisma";
import { isCoachLive } from "@/lib/coach";
import { calculatePriceBreakdown } from "@/lib/money";
import { perSessionBreakdown } from "@/lib/bundles";
import { rangesOverlap } from "@/lib/bookingConflicts";
import { checkSlot, SLOT_HOLDING_STATUS_FILTER } from "@/lib/availability";
import { generateMockVideoCallUrl } from "@/lib/videoCall";
import { enforceContactPolicy, rejectIfSuspended, ACCOUNT_SUSPENDED_MESSAGE } from "@/lib/contactPolicy";
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
  locationText: string;
  secondAdultName?: string;
};

/**
 * Shared validation + pricing for a prospective booking, used both when creating the
 * Stripe PaymentIntent (before the card is charged) and again when the booking row is
 * actually created (to close the race window and never trust client-supplied pricing).
 */
export async function validateBookingRequest(parentProfile: ParentProfile, data: BookingRequestInput) {
  await assertParentMayBook(parentProfile, data.locationText);

  const child = await prisma.child.findUnique({ where: { id: data.childId } });
  if (!child || child.parentProfileId !== parentProfile.id) {
    throw new BookingValidationError("Select a valid child on your account.");
  }

  const coach = await prisma.coachProfile.findUnique({
    where: { id: data.coachProfileId },
    include: { sports: true, user: { select: { isSuspended: true } } },
  });
  if (!coach || !isCoachLive(coach) || !coach.hourlyRateCents) {
    throw new BookingValidationError("This coach isn't available for booking right now.");
  }
  if (!coach.sports.some((s) => s.sport === data.sport)) {
    throw new BookingValidationError("This coach doesn't offer that sport.");
  }

  await assertSecondAdultNamed(coach, parentProfile, data.secondAdultName);

  await assertSlotOpen(coach.id, data.scheduledAt, data.durationMinutes);

  const breakdown = calculatePriceBreakdown(coach.hourlyRateCents, data.durationMinutes);
  const discountCents = Math.min(parentProfile.creditCents, breakdown.sessionCostCents);
  const totalDueCents = breakdown.totalChargedCents - discountCents;

  const isFirstSession = await isFirstSessionWithCoach(parentProfile.id, coach.id);

  return { child, coach, sport: data.sport as Sport, breakdown, discountCents, totalDueCents, isFirstSession };
}

export type PackageBookingRequestInput = {
  packageId: string;
  childId: string;
  scheduledAt: Date;
  locationText: string;
  secondAdultName?: string;
};

/**
 * Validation + pricing for a booking drawn from a prepaid SessionPackage — no Stripe
 * hold involved (the package was already paid for in full at purchase), so this checks
 * package ownership/capacity instead of a card. durationMinutes/sport/coach are all
 * locked to what the package was bought for, not taken from the request.
 */
export async function validatePackageBookingRequest(parentProfile: ParentProfile, data: PackageBookingRequestInput) {
  await assertParentMayBook(parentProfile, data.locationText);

  const child = await prisma.child.findUnique({ where: { id: data.childId } });
  if (!child || child.parentProfileId !== parentProfile.id) {
    throw new BookingValidationError("Select a valid child on your account.");
  }

  const pkg = await prisma.sessionPackage.findUnique({
    where: { id: data.packageId },
    include: { coachProfile: { include: { sports: true, user: { select: { isSuspended: true } } } } },
  });
  if (!pkg || pkg.parentProfileId !== parentProfile.id) {
    throw new BookingValidationError("Package not found.");
  }
  if (pkg.status !== "ACTIVE" || pkg.sessionsUsed >= pkg.totalSessions) {
    throw new BookingValidationError("This package has no sessions left.");
  }
  if (!isCoachLive(pkg.coachProfile)) {
    throw new BookingValidationError("This coach isn't available for booking right now.");
  }
  await assertSecondAdultNamed(pkg.coachProfile, parentProfile, data.secondAdultName);

  await assertSlotOpen(pkg.coachProfileId, data.scheduledAt, pkg.durationMinutes);

  const breakdown = perSessionBreakdown(pkg.pricePerSessionCents, pkg.discountPercent);
  const isFirstSession = await isFirstSessionWithCoach(parentProfile.id, pkg.coachProfileId);

  return { child, package: pkg, coach: pkg.coachProfile, sport: pkg.sport, breakdown, isFirstSession };
}

/**
 * Runs first in every booking path (single, package, quick rebook): a suspended parent
 * can't book, and the meeting location — which the coach sees — goes through the same
 * contact filter as messages. Both surface as a BookingValidationError so every route's
 * existing error handling applies unchanged.
 */
async function assertParentMayBook(parentProfile: ParentProfile, locationText: string) {
  const suspended = await rejectIfSuspended(parentProfile.userId);
  if (suspended) {
    throw new BookingValidationError(ACCOUNT_SUSPENDED_MESSAGE, 403);
  }
  const blocked = await enforceContactPolicy({
    userId: parentProfile.userId,
    context: "BOOKING_LOCATION",
    fields: [locationText],
  });
  if (blocked) {
    const body = (await blocked.json()) as { error: string };
    throw new BookingValidationError(body.error, blocked.status);
  }
}

export const SECOND_ADULT_REQUIRED_MESSAGE =
  "This coach is under 18, so you and a second adult both need to be at the session. Enter the second adult's name.";

/**
 * Sessions with a minor coach need the booking parent present plus a second adult. Runs in
 * every booking path (single, package, quick rebook): the second adult must be named, and
 * can't be the booking parent themselves.
 */
async function assertSecondAdultNamed(coach: { isMinorCoach: boolean }, parentProfile: ParentProfile, secondAdultName?: string) {
  if (!coach.isMinorCoach) return;
  const name = secondAdultName?.trim().replace(/\s+/g, " ") ?? "";
  if (name.length < 2) {
    throw new BookingValidationError(SECOND_ADULT_REQUIRED_MESSAGE);
  }
  const parentUser = await prisma.user.findUnique({ where: { id: parentProfile.userId }, select: { name: true } });
  if (parentUser && parentUser.name.trim().replace(/\s+/g, " ").toLowerCase() === name.toLowerCase()) {
    throw new BookingValidationError("The second adult has to be someone other than you. You'll both need to be at the session.");
  }
}

/**
 * The one server-side gate on *when* a session can be booked, shared by every path
 * (single booking, package draw-down, quick rebook): inside the coach's posted Pacific
 * hours with the full session fitting, on the 30-minute grid, in the future, and not
 * overlapping any non-cancelled booking for this coach — whichever family made it.
 */
async function assertSlotOpen(coachProfileId: string, scheduledAt: Date, durationMinutes: number) {
  const [windows, busy] = await Promise.all([
    prisma.availability.findMany({
      where: { coachProfileId },
      select: { dayOfWeek: true, startMinute: true, endMinute: true },
    }),
    prisma.booking.findMany({
      where: { coachProfileId, status: SLOT_HOLDING_STATUS_FILTER },
      select: { scheduledAt: true, durationMinutes: true },
    }),
  ]);
  const result = checkSlot({ scheduledAt, durationMinutes, windows, busy, now: new Date() });
  if (!result.ok) {
    throw new BookingValidationError(result.message, result.reason === "conflict" ? 409 : 400);
  }
}

async function isFirstSessionWithCoach(parentProfileId: string, coachProfileId: string): Promise<boolean> {
  const priorBookingCount = await prisma.booking.count({ where: { parentProfileId, coachProfileId } });
  return priorBookingCount === 0;
}

type CreateConfirmedBookingInput = {
  parentProfileId: string;
  coachProfileId: string;
  childId: string;
  sport: Sport;
  scheduledAt: Date;
  durationMinutes: number;
  locationText: string;
  secondAdultName?: string | null;
  priceCents: number;
  platformFeeCents: number;
  discountCents: number;
  isFirstSession: boolean;
  stripePaymentIntentId: string | null;
  stripePaymentMethodId: string | null;
};

/**
 * Creates a normal (non-package) CONFIRMED booking backed by a Stripe hold — the
 * "insert row, decrement referral credit, generate a first-session video call link"
 * sequence shared by the ordinary booking flow (POST /api/bookings) and quick rebook
 * (POST /api/bookings/quick-rebook). Re-checks the conflict inside the transaction to
 * close the race window between validation and this write; returns null on conflict
 * rather than throwing, so callers can void any Stripe hold before responding.
 */
export async function createConfirmedBooking(input: CreateConfirmedBookingInput) {
  return prisma.$transaction(async (tx) => {
    const stillActive = await tx.booking.findMany({
      where: { coachProfileId: input.coachProfileId, status: SLOT_HOLDING_STATUS_FILTER },
      select: { scheduledAt: true, durationMinutes: true },
    });
    if (stillActive.some((b) => rangesOverlap(input.scheduledAt, input.durationMinutes, b.scheduledAt, b.durationMinutes))) {
      throw new Error("CONFLICT");
    }

    const created = await tx.booking.create({
      data: {
        parentProfileId: input.parentProfileId,
        coachProfileId: input.coachProfileId,
        childId: input.childId,
        sport: input.sport,
        scheduledAt: input.scheduledAt,
        durationMinutes: input.durationMinutes,
        locationText: input.locationText,
        priceCents: input.priceCents,
        platformFeeCents: input.platformFeeCents,
        discountCents: input.discountCents,
        status: "CONFIRMED",
        parentalConsent: true,
        secondAdultName: input.secondAdultName?.trim() || null,
        stripePaymentIntentId: input.stripePaymentIntentId,
        stripePaymentMethodId: input.stripePaymentMethodId,
      },
    });

    let videoCallUrl: string | null = null;
    if (input.isFirstSession) {
      videoCallUrl = generateMockVideoCallUrl(created.id);
      await tx.booking.update({ where: { id: created.id }, data: { videoCallUrl } });
    }

    if (input.discountCents > 0) {
      await tx.parentProfile.update({
        where: { id: input.parentProfileId },
        data: { creditCents: { decrement: input.discountCents } },
      });
    }

    return { ...created, videoCallUrl };
  }).catch((err) => {
    if (err instanceof Error && err.message === "CONFLICT") return null;
    throw err;
  });
}
