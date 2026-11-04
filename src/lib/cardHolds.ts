import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { bookingNeedsAdminEmail, holdFailedParentEmail, holdNotFixedCoachEmail, holdNotFixedParentEmail } from "@/lib/emails";
import { emailAdmins } from "@/lib/notify";
import { bookingChargeCents } from "@/lib/cancellation";
import { cancelPaymentIntent, classifyStripeFailure, placeOffSessionHold, STRIPE_MIN_CENTS } from "@/lib/payment";
import { HOLD_FIX_HOURS, HOLD_NOT_FIXED_REASON, holdFixDeadline } from "@/lib/holdTiming";
import { failureReason, type JobLog } from "@/lib/jobs/runLog";
import type { Prisma } from "@/generated/prisma/client";

/**
 * The card-holds job (rules in src/lib/holdTiming.ts). Each run:
 *
 * 1. Places every due hold off-session on the card saved at booking. A card problem (declined,
 *    needs authentication) records holdFailedAt and emails the parent once to update their card
 *    (/dashboard/bookings/[id]/card places the hold with the new card). A temporary Stripe problem
 *    is retried next run and no one is emailed.
 * 2. Cancels bookings whose hold failed and still isn't fixed HOLD_FIX_HOURS before the session:
 *    the parent isn't charged, referral credit comes back, both sides are emailed, and the booking
 *    is flagged for an admin.
 *
 * Safe to run twice at once: each booking is claimed with a guarded update before Stripe is
 * called (holdClaimedAt, held for CLAIM_MS), the hold is saved only onto a booking that's still
 * CONFIRMED with no hold (otherwise it's released straight away), and the Stripe call carries an
 * idempotency key. Emails go out only from the run that made the change.
 */

const CLAIM_MS = 10 * 60 * 1000;
const BATCH = 100;

const include = {
  parentProfile: { include: { user: true } },
  coachProfile: { include: { user: true } },
  child: true,
} as const;

export async function runCardHoldsJob(log: JobLog, now: Date) {
  await placeDueHolds(log, now);
  await cancelUnfixedHolds(log, now);
}

function claimable(now: Date) {
  return [{ holdClaimedAt: null }, { holdClaimedAt: { lt: new Date(now.getTime() - CLAIM_MS) } }];
}

async function placeDueHolds(log: JobLog, now: Date) {
  const due = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      packageId: null,
      stripePaymentIntentId: null,
      holdFailedAt: null,
      holdDueAt: { lte: now },
      // A session that already started with no hold is charged from the saved card when it's
      // completed (captureHeldPayment); a hold now would only be released again.
      scheduledAt: { gt: now },
      OR: claimable(now),
    },
    include,
    orderBy: { scheduledAt: "asc" },
    take: BATCH,
  });

  await log.each(due, async (b) => {
    const { count } = await prisma.booking.updateMany({
      where: { id: b.id, status: "CONFIRMED", stripePaymentIntentId: null, holdFailedAt: null, OR: claimable(now) },
      data: { holdClaimedAt: now },
    });
    if (count !== 1) return; // another run has it

    const amountCents = bookingChargeCents(b);
    const customer = b.parentProfile.stripeCustomerId;
    const card = b.stripePaymentMethodId;
    if (!customer || !card || amountCents < STRIPE_MIN_CENTS) {
      await recordFailure(b, "no_saved_card", log, now);
      return;
    }

    let holdId: string;
    try {
      const intent = await placeOffSessionHold({
        bookingId: b.id,
        parentProfileId: b.parentProfileId,
        stripeCustomerId: customer,
        stripePaymentMethodId: card,
        amountCents,
      });
      holdId = intent.id;
    } catch (err) {
      const failure = classifyStripeFailure(err);
      if (failure.kind === "TEMPORARY") {
        await prisma.booking.update({ where: { id: b.id }, data: { holdClaimedAt: null } });
        log.count("Stripe unavailable (retried next run)");
        log.fail(`booking ${b.id}`, `${failureReason(err)} (will retry)`);
        return;
      }
      await recordFailure(b, failure.code, log, now);
      return;
    }

    const saved = await prisma.booking.updateMany({
      where: { id: b.id, status: "CONFIRMED", stripePaymentIntentId: null },
      data: { stripePaymentIntentId: holdId, holdPlacedAt: now, holdClaimedAt: null },
    });
    if (saved.count !== 1) {
      // Cancelled, or the parent placed a hold with a new card, while Stripe was working.
      await cancelPaymentIntent(holdId);
      log.count("holds released (booking changed meanwhile)");
      return;
    }
    log.ok("holds placed");
  });
}

type DueBooking = Prisma.BookingGetPayload<{ include: typeof include }>;

async function recordFailure(b: DueBooking, code: string, log: JobLog, now: Date) {
  const { count } = await prisma.booking.updateMany({
    where: { id: b.id, status: "CONFIRMED", stripePaymentIntentId: null, holdFailedAt: null },
    data: { holdFailedAt: now, holdFailureCode: code, holdClaimedAt: null },
  });
  if (count !== 1) return;
  log.count("card problems (parent emailed)");
  const sent = await sendEmail(
    holdFailedParentEmail({
      to: b.parentProfile.user.email,
      bookingId: b.id,
      coachName: b.coachProfile.user.name,
      childFirstName: b.child?.firstName ?? null,
      scheduledAt: b.scheduledAt,
      amountCents: bookingChargeCents(b),
      fixBy: holdFixDeadline(b.scheduledAt),
      needsAuthentication: code === "authentication_required",
    }),
  );
  if (sent.status === "failed") log.fail(`booking ${b.id}`, "card-problem email to the parent wasn't sent");
}

async function cancelUnfixedHolds(log: JobLog, now: Date) {
  const overdue = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      packageId: null,
      stripePaymentIntentId: null,
      holdFailedAt: { not: null },
      scheduledAt: { gt: now, lte: new Date(now.getTime() + HOLD_FIX_HOURS * 60 * 60 * 1000) },
    },
    include,
    take: BATCH,
  });

  await log.each(overdue, async (b) => {
    const cancelled = await prisma.$transaction(async (tx) => {
      const { count } = await tx.booking.updateMany({
        where: { id: b.id, status: "CONFIRMED", stripePaymentIntentId: null },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          cancelledBy: "PLATFORM",
          cancelReason: HOLD_NOT_FIXED_REASON,
          paymentStatus: "CANCELLED",
          adminFlag: "HOLD_NOT_FIXED",
          adminFlaggedAt: now,
        },
      });
      if (count !== 1) return false;
      if (b.discountCents > 0) {
        await tx.parentProfile.update({ where: { id: b.parentProfileId }, data: { creditCents: { increment: b.discountCents } } });
      }
      return true;
    });
    if (!cancelled) return;
    log.ok("cancelled (card not fixed)");

    const parent = await sendEmail(
      holdNotFixedParentEmail({
        to: b.parentProfile.user.email,
        coachName: b.coachProfile.user.name,
        childFirstName: b.child?.firstName ?? null,
        scheduledAt: b.scheduledAt,
        amountCents: bookingChargeCents(b),
        creditReturnedCents: b.discountCents,
      }),
    );
    const coach = await sendEmail(holdNotFixedCoachEmail({ to: b.coachProfile.user.email, scheduledAt: b.scheduledAt }));
    if (parent.status === "failed" || coach.status === "failed") log.fail(`booking ${b.id}`, "a cancellation email wasn't sent");
    await emailAdmins((to) => bookingNeedsAdminEmail({ to, flag: "HOLD_NOT_FIXED" }));
  });
}
