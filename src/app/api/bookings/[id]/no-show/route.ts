import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { noShowSchema } from "@/lib/validation";
import { cancelPaymentIntent } from "@/lib/payment";
import { sendMockEmail } from "@/lib/mockEmail";

const DEFAULT_DETAILS = "Parent reported that the coach did not show up.";

/**
 * Parent-reported no-show, for a session that hasn't been marked complete
 * yet. Voids the held payment immediately (the parent is never charged) and
 * opens an admin case for follow-up/pattern review.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { parentProfile: { include: { user: true } }, coachProfile: { include: { user: true } }, dispute: true },
  });
  if (!booking || booking.parentProfile.userId !== session.user.id) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  if (booking.status !== "CONFIRMED") {
    return NextResponse.json({ error: "This session can no longer be reported as a no-show here." }, { status: 400 });
  }
  if (booking.dispute) {
    return NextResponse.json({ error: "This session already has an open case." }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = noShowSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const details = parsed.data.details?.trim() || DEFAULT_DETAILS;

  try {
    await cancelPaymentIntent(booking.stripePaymentIntentId);
  } catch (err) {
    console.error("Stripe cancel failed", err);
    return NextResponse.json({ error: "We couldn't void the payment hold. Please try again or contact support." }, { status: 502 });
  }

  await prisma.$transaction([
    prisma.booking.update({ where: { id }, data: { status: "CANCELLED", paymentStatus: "CANCELLED" } }),
    prisma.dispute.create({
      data: {
        bookingId: booking.id,
        parentProfileId: booking.parentProfileId,
        coachProfileId: booking.coachProfileId,
        reason: "NO_SHOW",
        details,
      },
    }),
  ]);

  sendMockEmail(
    booking.parentProfile.user.email,
    "We're on it — no-show reported",
    `Thanks for letting us know your session with ${booking.coachProfile.user.name} didn't happen. Your card was never charged and our team is reviewing the case.`,
  );
  sendMockEmail(
    booking.coachProfile.user.email,
    "Session flagged as a no-show",
    `The parent for your ${booking.scheduledAt.toLocaleString()} session reported that it didn't happen. This has been flagged for admin review.`,
  );

  return NextResponse.json({ ok: true });
}
