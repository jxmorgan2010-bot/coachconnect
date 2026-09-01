import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCoachProfile } from "@/lib/session";
import { coachProfileSchema } from "@/lib/validation";
import type { Sport } from "@/generated/prisma/client";

export async function PATCH(req: Request) {
  const profile = await requireCoachProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = coachProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { sports, hourlyRateDollars, zip, ...rest } = parsed.data;

  await prisma.$transaction([
    prisma.coachProfile.update({
      where: { id: profile.id },
      data: {
        ...rest,
        zip: zip || null,
        hourlyRateCents: Math.round(hourlyRateDollars * 100),
      },
    }),
    prisma.coachSport.deleteMany({ where: { coachProfileId: profile.id } }),
    prisma.coachSport.createMany({
      data: sports.map((sport) => ({ coachProfileId: profile.id, sport: sport as Sport })),
    }),
  ]);

  return NextResponse.json({ ok: true });
}
