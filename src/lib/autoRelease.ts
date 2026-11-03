import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { autoReleasedCoachEmail, autoReleasedParentEmail, bookingNeedsAdminEmail } from "@/lib/emails";
import { emailAdmins } from "@/lib/notify";
import { captureHeldPayment, classifyStripeFailure } from "@/lib/payment";
import { bookingChargeCents } from "@/lib/cancellation";
import { AUTO_RELEASE_GRACE_HOURS } from "@/lib/money";
import { sessionEndsAt } from "@/lib/sessionTiming";
import { settleReferralAfterCompletion } from "@/lib/referral";
import { failureReason, type JobLog } from "@/lib/jobs/runLog";

const HOUR = 60 * 60 * 1000;
const BATCH = 100;

/**
 * A parent has AUTO_RELEASE_GRACE_HOURS after a session ends to mark it complete or report a
 * no-show. If they do neither (most likely they just forgot) and no case is open, this job
 * completes the booking and charges it: the hold is captured, or the card saved at booking is
 * charged if there's no live hold (captureHeldPayment). Both sides are emailed.
 *
 * Safe to run twice: the Stripe call carries the same idempotency key as the parent's own
 * "Mark complete", so the booking is never charged twice, and only the run whose guarded
 * CONFIRMED -> COMPLETED update succeeds sends the emails. A card problem flags the booking for
 * an admin (CHARGE_FAILED) and it's skipped until the flag is cleared on /admin/jobs, so a
 * declined card isn't retried every run. A temporary Stripe problem is retried next run.
 */
export async function runAutoReleaseJob(log: JobLog, now: Date) {
  const candidates = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      adminFlag: null,
      dispute: { is: null },
      // Pre-filter on the start time; the exact end-plus-grace check is below.
      scheduledAt: { lte: new Date(now.getTime() - AUTO_RELEASE_GRACE_HOURS * HOUR) },
    },
    include: { parentProfile: { include: { user: true } }, coachProfile: { include: { user: true } } },
    orderBy: { scheduledAt: "asc" },
    take: BATCH,
  });
  const due = candidates.filter((b) => sessionEndsAt(b).getTime() + AUTO_RELEASE_GRACE_HOURS * HOUR <= now.getTime());

  await log.each(due, async (b) => {
    let paymentIntentId: string | null;
    try {
      paymentIntentId = await captureHeldPayment({
        bookingId: b.id,
        stripePaymentIntentId: b.stripePaymentIntentId,
        stripeCustomerId: b.parentProfile.stripeCustomerId,
        stripePaymentMethodId: b.stripePaymentMethodId,
        amountCents: bookingChargeCents(b),
        label: "auto-release",
      });
    } catch (err) {
      if (classifyStripeFailure(err).kind === "TEMPORARY") {
        log.count("Stripe unavailable (retried next run)");
        log.fail(`booking ${b.id}`, `${failureReason(err)} (will retry)`);
        return;
      }
      const { count } = await prisma.booking.updateMany({
        where: { id: b.id, status: "CONFIRMED", adminFlag: null },
        data: { adminFlag: "CHARGE_FAILED", adminFlaggedAt: now },
      });
      log.count("charges failed (flagged for admin)");
      log.fail(`booking ${b.id}`, `${failureReason(err)} (flagged for admin)`);
      if (count === 1) await emailAdmins((to) => bookingNeedsAdminEmail({ to, flag: "CHARGE_FAILED" }));
      return;
    }

    const { count } = await prisma.booking.updateMany({
      where: { id: b.id, status: "CONFIRMED" },
      data: {
        status: "COMPLETED",
        completedAt: now,
        paymentStatus: "CAPTURED",
        capturedAt: now,
        autoCompleted: true,
        stripePaymentIntentId: paymentIntentId,
      },
    });
    if (count !== 1) return; // completed by the parent or another run meanwhile
    await settleReferralAfterCompletion(b.id);
    log.ok("auto-completed and charged");

    const parent = await sendEmail(autoReleasedParentEmail({ to: b.parentProfile.user.email, coachName: b.coachProfile.user.name }));
    const coach = await sendEmail(autoReleasedCoachEmail({ to: b.coachProfile.user.email, scheduledAt: b.scheduledAt }));
    if (parent.status === "failed" || coach.status === "failed") log.fail(`booking ${b.id}`, "an auto-release email wasn't sent");
  });
}
