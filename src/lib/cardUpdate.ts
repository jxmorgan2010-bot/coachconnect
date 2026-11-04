import { prisma } from "@/lib/prisma";
import { holdState } from "@/lib/holdTiming";

/**
 * The booking a parent may fix from /dashboard/bookings/[id]/card: theirs, still CONFIRMED and
 * not started, and its 2-day hold failed (src/lib/cardHolds.ts). Shared by the page and the two
 * API steps so they agree on when the fix is open.
 */
export async function loadFixableBooking(bookingId: string, parentUserId: string, now: Date = new Date()) {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { parentProfile: { include: { user: true } }, coachProfile: { include: { user: true } }, child: true },
  });
  if (!b || b.parentProfile.userId !== parentUserId) return { error: "NOT_FOUND" as const };
  if (b.status !== "CONFIRMED" || b.scheduledAt.getTime() <= now.getTime()) return { error: "CLOSED" as const, booking: b };
  if (holdState(b) !== "FAILED") return { error: "NOT_NEEDED" as const, booking: b };
  return { booking: b };
}
