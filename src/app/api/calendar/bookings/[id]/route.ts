import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { buildIcs, icsFileName, toCalendarSession, type CalendarViewer } from "@/lib/calendar";

/** One session as a downloadable .ics, for the booking's parent or coach only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session?.user) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: {
      child: { select: { firstName: true } },
      parentProfile: { select: { userId: true } },
      coachProfile: { select: { userId: true, user: { select: { name: true } } } },
    },
  });

  let viewer: CalendarViewer | null = null;
  if (booking?.parentProfile.userId === session.user.id) viewer = "PARENT";
  else if (booking?.coachProfile.userId === session.user.id) viewer = "COACH";
  if (!booking || !viewer) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const s = toCalendarSession(booking);
  return new Response(buildIcs([s], { viewer }), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${icsFileName(s)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
