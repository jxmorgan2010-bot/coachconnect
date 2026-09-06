import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { capturePaymentIntent } from "@/lib/payment";

/**
 * Only the parent can mark a session complete — this is what releases the
 * held payment to the coach. Keeping this parent-only (not the coach) means
 * a coach can't force a payout by marking their own session done.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const booking = await prisma.booking.findUnique({ where: { id }, include: { parentProfile: true } });
  if (!booking || booking.parentProfile.userId !== session.user.id) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  if (booking.status !== "CONFIRMED") {
    return NextResponse.json({ error: "Only confirmed sessions can be marked complete." }, { status: 400 });
  }

  try {
    await capturePaymentIntent(booking.stripePaymentIntentId, booking.priceCents - booking.discountCents);
  } catch (err) {
    console.error("Stripe capture failed", err);
    return NextResponse.json({ error: "We couldn't charge the card on file. Please try again or contact support." }, { status: 502 });
  }

  const now = new Date();
  const updated = await prisma.booking.update({
    where: { id },
    data: { status: "COMPLETED", completedAt: now, paymentStatus: "CAPTURED", capturedAt: now },
  });

  return NextResponse.json({ ok: true, booking: updated });
}
