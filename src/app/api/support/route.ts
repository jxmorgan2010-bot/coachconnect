import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { supportRequestSchema } from "@/lib/validation";

/**
 * Catch-all "get help" widget for parents (or coaches) with an issue on any
 * session — not just no-shows, which have their own dedicated flow. Lands
 * in the same admin queue as other reports.
 */
export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Please sign in to reach support." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = supportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  if (parsed.data.bookingId) {
    const booking = await prisma.booking.findUnique({
      where: { id: parsed.data.bookingId },
      include: { parentProfile: true },
    });
    if (!booking || booking.parentProfile.userId !== session.user.id) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }
  }

  await prisma.report.create({
    data: {
      reporterId: session.user.id,
      targetType: "SUPPORT_REQUEST",
      targetId: parsed.data.bookingId ?? "general",
      reason: "Support request",
      details: parsed.data.message,
    },
  });

  return NextResponse.json({ ok: true });
}
