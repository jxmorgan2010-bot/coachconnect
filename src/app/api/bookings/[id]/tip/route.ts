import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { tipSchema } from "@/lib/validation";
import { chargeTipOffSession } from "@/lib/payment";

/** Tips are only offered after a session is marked complete, and pass through to the coach in full. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const booking = await prisma.booking.findUnique({ where: { id }, include: { parentProfile: true } });
  if (!booking || booking.parentProfile.userId !== session.user.id) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  if (booking.status !== "COMPLETED") {
    return NextResponse.json({ error: "You can tip once the session is complete." }, { status: 400 });
  }
  if (booking.tippedAt) {
    return NextResponse.json({ error: "You've already tipped for this session." }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const parsed = tipSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  try {
    await chargeTipOffSession(booking.parentProfile.stripeCustomerId, booking.stripePaymentMethodId, parsed.data.tipCents);
  } catch (err) {
    console.error("Stripe tip charge failed", err);
    return NextResponse.json({ error: "We couldn't charge the card on file for the tip. Please try again." }, { status: 502 });
  }

  const updated = await prisma.booking.update({
    where: { id },
    data: { tipCents: parsed.data.tipCents, tippedAt: new Date() },
  });

  return NextResponse.json({ ok: true, booking: updated });
}
