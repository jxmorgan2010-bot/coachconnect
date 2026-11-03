import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getStripe } from "@/lib/stripe";
import { bookingChargeCents } from "@/lib/cancellation";
import { loadFixableBooking } from "@/lib/cardUpdate";

/**
 * Step 1 of updating a card after the 2-day hold failed: a manual-capture PaymentIntent (the
 * hold, placed now) that the parent confirms with the new card on the page, including any bank
 * authentication. The new card is saved for later charges too. Step 2 is POST ../card.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const { id } = await params;
  const found = await loadFixableBooking(id, session.user.id);
  if (found.error === "NOT_FOUND") return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (found.error) return NextResponse.json({ error: "This session doesn't need a card update anymore." }, { status: 409 });

  const b = found.booking;
  const customer = b.parentProfile.stripeCustomerId;
  if (!customer) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const intent = await getStripe().paymentIntents.create({
    amount: bookingChargeCents(b),
    currency: "usd",
    customer,
    payment_method_types: ["card"],
    capture_method: "manual",
    setup_future_usage: "off_session",
    metadata: { parentProfileId: b.parentProfileId, coachProfileId: b.coachProfileId, bookingId: b.id },
  });
  return NextResponse.json({ ok: true, clientSecret: intent.client_secret, paymentIntentId: intent.id });
}
