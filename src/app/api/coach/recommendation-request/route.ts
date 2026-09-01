import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireCoachProfile } from "@/lib/session";

export async function POST() {
  const profile = await requireCoachProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const token = randomBytes(16).toString("hex");
  const recommendation = await prisma.recommendation.create({
    data: { coachProfileId: profile.id, token },
  });

  return NextResponse.json({ ok: true, token: recommendation.token });
}

export async function GET() {
  const profile = await requireCoachProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const recommendations = await prisma.recommendation.findMany({
    where: { coachProfileId: profile.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ recommendations });
}
