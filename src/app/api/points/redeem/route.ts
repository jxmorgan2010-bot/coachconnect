import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { pointsRedeemSchema } from "@/lib/validation";
import { awardPoints, pointsToCreditCents } from "@/lib/points";

/**
 * Converts parent points into booking credit — reuses the same ParentProfile.creditCents
 * wallet that bookingValidation.ts already applies automatically at booking time, rather
 * than a second discount mechanism.
 */
export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = pointsRedeemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const parentProfile = await prisma.parentProfile.findUnique({ where: { userId: session.user.id } });
  if (!parentProfile) {
    return NextResponse.json({ error: "Parent profile not found." }, { status: 404 });
  }
  if (parsed.data.points > parentProfile.pointsBalance) {
    return NextResponse.json({ error: "You don't have that many points." }, { status: 400 });
  }

  const creditCents = pointsToCreditCents(parsed.data.points);
  if (creditCents <= 0) {
    return NextResponse.json({ error: "Redeem a few more points — that's not enough for any credit yet." }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await awardPoints(tx, { parentProfileId: parentProfile.id, action: "REDEEMED_FOR_CREDIT", points: -parsed.data.points });
    await tx.parentProfile.update({ where: { id: parentProfile.id }, data: { creditCents: { increment: creditCents } } });
  });

  return NextResponse.json({ ok: true, creditCents });
}
