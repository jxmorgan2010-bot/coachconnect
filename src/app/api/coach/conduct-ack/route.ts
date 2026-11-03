import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCoachProfile } from "@/lib/session";
import { notifyIfCoachAwaitingReview } from "@/lib/notify";

export async function POST() {
  const profile = await requireCoachProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  await prisma.coachProfile.update({
    where: { id: profile.id },
    data: { conductAcknowledged: true },
  });

  notifyIfCoachAwaitingReview(profile.userId);
  return NextResponse.json({ ok: true });
}
