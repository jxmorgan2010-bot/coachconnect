import { prisma } from "@/lib/prisma";
import { sendMockEmail } from "@/lib/mockEmail";
import { capturePaymentIntent } from "@/lib/payment";
import { AUTO_RELEASE_GRACE_HOURS } from "@/lib/money";

const HOUR = 60 * 60 * 1000;

/**
 * A parent has AUTO_RELEASE_GRACE_HOURS after a session's scheduled end
 * time to either mark it complete or report a no-show. If they do neither
 * (most likely just forgot), we auto-complete the booking and capture the
 * held payment so the coach isn't stuck waiting forever.
 *
 * Same "no real scheduler in this dev setup" story as the reminder sweep —
 * exposed as POST /api/system/auto-release, admin-triggerable for now.
 */
export async function runAutoReleaseSweep(now: Date = new Date()) {
  const candidates = await prisma.booking.findMany({
    where: { status: "CONFIRMED", scheduledAt: { lte: new Date(now.getTime() - AUTO_RELEASE_GRACE_HOURS * HOUR) } },
    include: { parentProfile: { include: { user: true } }, coachProfile: { include: { user: true } } },
  });

  let releasedCount = 0;
  for (const b of candidates) {
    const sessionEndMs = b.scheduledAt.getTime() + b.durationMinutes * 60_000;
    if (sessionEndMs + AUTO_RELEASE_GRACE_HOURS * HOUR > now.getTime()) continue;

    try {
      await capturePaymentIntent(b.stripePaymentIntentId, b.priceCents - b.discountCents);
    } catch (err) {
      console.error(`Stripe capture failed during auto-release sweep for booking ${b.id}`, err);
      continue;
    }

    await prisma.booking.update({
      where: { id: b.id },
      data: { status: "COMPLETED", completedAt: now, paymentStatus: "CAPTURED", capturedAt: now, autoCompleted: true },
    });

    sendMockEmail(
      b.parentProfile.user.email,
      "Session auto-completed",
      `We didn't hear back within ${AUTO_RELEASE_GRACE_HOURS} hours of your session with ${b.coachProfile.user.name}, so it's been marked complete and payment released. Reply if that's not right.`,
    );
    sendMockEmail(
      b.coachProfile.user.email,
      "Payment released",
      `Your session on ${b.scheduledAt.toLocaleString()} was auto-completed after ${AUTO_RELEASE_GRACE_HOURS} hours with no response from the parent, and payment has been released.`,
    );
    releasedCount++;
  }

  return { releasedCount };
}
