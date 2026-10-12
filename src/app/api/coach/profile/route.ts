import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCoachProfile } from "@/lib/session";
import { coachProfileSchema } from "@/lib/validation";
import { enforceContactPolicy } from "@/lib/contactPolicy";
import { flagsFromLevels } from "@/lib/skillLevels";
import type { SkillLevel, Sport } from "@/generated/prisma/client";

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

  const { sports, sportLevels, hourlyRateDollars, ...rest } = parsed.data;

  // Bio and school name are shown publicly on the coach's profile.
  const blocked = await enforceContactPolicy({
    userId: profile.userId,
    context: "BIO",
    fields: [rest.bio, rest.schoolName],
  });
  if (blocked) return blocked;

  await prisma.$transaction([
    prisma.coachProfile.update({
      where: { id: profile.id },
      data: {
        ...rest,
        hourlyRateCents: Math.round(hourlyRateDollars * 100),
      },
    }),
    prisma.coachSport.deleteMany({ where: { coachProfileId: profile.id } }),
    prisma.coachSport.createMany({
      // A sport sent without levels takes every level (the column defaults).
      data: sports.map((sport) => {
        const levels = sportLevels?.find((s) => s.sport === sport)?.levels as SkillLevel[] | undefined;
        return { coachProfileId: profile.id, sport: sport as Sport, ...(levels ? flagsFromLevels(levels) : {}) };
      }),
    }),
  ]);

  return NextResponse.json({ ok: true });
}
