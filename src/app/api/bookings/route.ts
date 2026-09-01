import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { bookingCreateSchema } from "@/lib/validation";
import { isCoachLive } from "@/lib/coach";
import { calculatePriceBreakdown } from "@/lib/money";
import { generateMockVideoCallUrl } from "@/lib/videoCall";
import type { Sport } from "@/generated/prisma/client";

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Only parent accounts can book sessions." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bookingCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const data = parsed.data;

  const parentProfile = await prisma.parentProfile.findUnique({ where: { userId: session.user.id } });
  if (!parentProfile) {
    return NextResponse.json({ error: "Parent profile not found." }, { status: 404 });
  }

  const child = await prisma.child.findUnique({ where: { id: data.childId } });
  if (!child || child.parentProfileId !== parentProfile.id) {
    return NextResponse.json({ error: "Select a valid child on your account." }, { status: 400 });
  }

  const coach = await prisma.coachProfile.findUnique({
    where: { id: data.coachProfileId },
    include: { sports: true },
  });
  if (!coach || !isCoachLive(coach) || !coach.hourlyRateCents) {
    return NextResponse.json({ error: "This coach isn't available for booking right now." }, { status: 400 });
  }
  if (!coach.sports.some((s) => s.sport === data.sport)) {
    return NextResponse.json({ error: "This coach doesn't offer that sport." }, { status: 400 });
  }

  const priorBookingCount = await prisma.booking.count({
    where: { parentProfileId: parentProfile.id, coachProfileId: coach.id },
  });
  const isFirstSession = priorBookingCount === 0;

  const breakdown = calculatePriceBreakdown(coach.hourlyRateCents, data.durationMinutes);
  const discountCents = Math.min(parentProfile.creditCents, breakdown.sessionCostCents);

  const booking = await prisma.$transaction(async (tx) => {
    const created = await tx.booking.create({
      data: {
        parentProfileId: parentProfile.id,
        coachProfileId: coach.id,
        childId: child.id,
        sport: data.sport as Sport,
        scheduledAt: data.scheduledAt,
        durationMinutes: data.durationMinutes,
        locationText: data.locationText,
        priceCents: breakdown.sessionCostCents,
        platformFeeCents: breakdown.platformFeeCents,
        discountCents,
        status: "CONFIRMED",
        parentalConsent: true,
      },
    });

    let videoCallUrl: string | null = null;
    if (isFirstSession) {
      videoCallUrl = generateMockVideoCallUrl(created.id);
      await tx.booking.update({ where: { id: created.id }, data: { videoCallUrl } });
    }

    if (discountCents > 0) {
      await tx.parentProfile.update({
        where: { id: parentProfile.id },
        data: { creditCents: { decrement: discountCents } },
      });
    }

    return { ...created, videoCallUrl };
  });

  return NextResponse.json({
    ok: true,
    bookingId: booking.id,
    isFirstSession,
    videoCallUrl: booking.videoCallUrl,
  });
}
