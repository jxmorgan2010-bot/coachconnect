import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { disputeSchema } from "@/lib/validation";
import type { DisputeReason } from "@/generated/prisma/client";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { parentProfile: true, dispute: true },
  });
  if (!booking || booking.parentProfile.userId !== session.user.id) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  if (booking.status !== "COMPLETED") {
    return NextResponse.json({ error: "Only completed sessions can be disputed." }, { status: 400 });
  }
  if (booking.dispute) {
    return NextResponse.json({ error: "This session already has an open case." }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const parsed = disputeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const dispute = await prisma.dispute.create({
    data: {
      bookingId: booking.id,
      parentProfileId: booking.parentProfileId,
      coachProfileId: booking.coachProfileId,
      reason: parsed.data.reason as DisputeReason,
      details: parsed.data.details,
    },
  });

  return NextResponse.json({ ok: true, dispute });
}
