import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { canMarkComplete, formatPacificTime, sessionEndsAt } from "@/lib/sessionTiming";
import { markSessionComplete } from "@/lib/markComplete";

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
  if (!canMarkComplete(booking)) {
    return NextResponse.json(
      { error: `You can mark this session complete after it ends, at ${formatPacificTime(sessionEndsAt(booking))}.` },
      { status: 400 },
    );
  }

  const result = await markSessionComplete(booking);
  switch (result.status) {
    case "COMPLETED":
      return NextResponse.json({ ok: true, booking: result.booking });
    case "BUSY":
      return NextResponse.json({ error: "This session is being finalized right now. Refresh in a minute to see where it stands." }, { status: 409 });
    case "CHARGE_FAILED":
      return NextResponse.json({ error: "We couldn't charge the card on file. Please try again or contact support." }, { status: 502 });
    case "ALREADY_COMPLETE":
      return NextResponse.json({ error: "This session was already marked complete." }, { status: 409 });
  }
}
