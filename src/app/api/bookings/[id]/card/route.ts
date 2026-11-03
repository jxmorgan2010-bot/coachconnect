import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { getStripe } from "@/lib/stripe";
import { bookingChargeCents } from "@/lib/cancellation";
import { cancelPaymentIntent } from "@/lib/payment";
import { loadFixableBooking } from "@/lib/cardUpdate";

const schema = z.object({ paymentIntentId: z.string().trim().min(1) });

/**
 * Step 2 of updating a card: the parent confirmed the hold from ./intent with their new card.
 * Checks it's theirs, for this booking, held for the right amount, then saves it as the booking's
 * hold and card. Saved only onto a booking that's still CONFIRMED with no hold, so it can't race
 * a cancellation or the card-holds job; otherwise the new hold is released.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });

  const { id } = await params;
  const found = await loadFixableBooking(id, session.user.id);
  if (found.error === "NOT_FOUND") return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(parsed.data.paymentIntentId);
  if (intent.metadata?.bookingId !== id || intent.metadata?.parentProfileId !== found.booking.parentProfileId) {
    return NextResponse.json({ error: "This card authorization doesn't belong to this booking." }, { status: 403 });
  }
  if (found.error) {
    await cancelPaymentIntent(intent.id).catch(() => {});
    return NextResponse.json({ error: "This session doesn't need a card update anymore." }, { status: 409 });
  }
  if (intent.status !== "requires_capture") {
    return NextResponse.json({ error: "Your card wasn't authorized. Please re-enter your card details." }, { status: 400 });
  }
  if (intent.amount !== bookingChargeCents(found.booking)) {
    await cancelPaymentIntent(intent.id).catch(() => {});
    return NextResponse.json({ error: "The amount changed. Please try again." }, { status: 409 });
  }
  const card = typeof intent.payment_method === "string" ? intent.payment_method : (intent.payment_method?.id ?? null);

  const now = new Date();
  const { count } = await prisma.booking.updateMany({
    where: { id, status: "CONFIRMED", stripePaymentIntentId: null },
    data: {
      stripePaymentIntentId: intent.id,
      stripePaymentMethodId: card,
      holdPlacedAt: now,
      holdFailedAt: null,
      holdFailureCode: null,
      holdClaimedAt: null,
    },
  });
  if (count !== 1) {
    await cancelPaymentIntent(intent.id).catch(() => {});
    return NextResponse.json({ error: "This session was just updated. Refresh to see where it stands." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
