import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";

/**
 * Existing booked ranges for a coach, so the booking form can grey out
 * times that would double-book them. Doesn't leak who booked what — just
 * the start time and duration.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;

  // Returns every active booking for this coach (not just one day) — the client
  // filters to the selected date itself so the comparison stays in the browser's
  // local timezone instead of drifting against the server's UTC day boundary.
  const bookings = await prisma.booking.findMany({
    where: { coachProfileId: id, status: { in: ["CONFIRMED", "COMPLETED"] } },
    select: { scheduledAt: true, durationMinutes: true },
  });

  const slots = bookings.map((b) => ({ scheduledAt: b.scheduledAt.toISOString(), durationMinutes: b.durationMinutes }));

  return NextResponse.json({ ok: true, slots });
}
