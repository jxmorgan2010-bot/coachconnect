import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCoachProfile } from "@/lib/session";
import { trainingPlanItemSchema } from "@/lib/validation";
import { enforceContactPolicy } from "@/lib/contactPolicy";
import type { Sport } from "@/generated/prisma/client";

export async function POST(req: Request) {
  const coachProfile = await requireCoachProfile();
  if (!coachProfile) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = trainingPlanItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const { childId, label } = parsed.data;
  const sport = parsed.data.sport as Sport;

  // Only allow a training-plan item for a child/sport this coach has actually coached.
  const hasBooking = await prisma.booking.count({
    where: { coachProfileId: coachProfile.id, childId, sport, status: { in: ["CONFIRMED", "COMPLETED"] } },
  });
  if (!hasBooking) {
    return NextResponse.json({ error: "You haven't booked a session with this child for that sport." }, { status: 403 });
  }

  const blocked = await enforceContactPolicy({ userId: coachProfile.userId, context: "TRAINING_PLAN", fields: [label] });
  if (blocked) return blocked;

  const count = await prisma.trainingPlanItem.count({ where: { coachProfileId: coachProfile.id, childId, sport } });

  const item = await prisma.trainingPlanItem.create({
    data: { coachProfileId: coachProfile.id, childId, sport, label, order: count },
  });

  return NextResponse.json({ ok: true, item });
}
