import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCoachProfile } from "@/lib/session";
import { coachProfileSchema, experiencedCoachProfileSchema } from "@/lib/validation";
import { enforceContactPolicy } from "@/lib/contactPolicy";
import { flagsFromLevels } from "@/lib/skillLevels";
import { ADULT_ONLY_SPORT_NOTE, SPORT_LABELS, isSportAllowedForCoach } from "@/lib/sports";
import type { SkillLevel, Sport } from "@/generated/prisma/client";

export async function PATCH(req: Request) {
  const profile = await requireCoachProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  // Experienced coaches have no school fields; which form applies comes from the saved type.
  const parsed =
    profile.coachType === "EXPERIENCED" ? experiencedCoachProfileSchema.safeParse(body) : coachProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { sports, sportLevels, hourlyRateDollars, ...rest } = parsed.data;

  const notAllowed = sports.filter((sport) => !isSportAllowedForCoach(sport as Sport, profile.isMinorCoach));
  if (notAllowed.length > 0) {
    const names = notAllowed.map((sport) => SPORT_LABELS[sport as Sport]).join(", ");
    return NextResponse.json({ error: `${names}: ${ADULT_ONLY_SPORT_NOTE}` }, { status: 400 });
  }

  // All of these are shown publicly on the coach's profile.
  const blocked = await enforceContactPolicy({
    userId: profile.userId,
    context: "BIO",
    fields: "schoolName" in rest ? [rest.bio, rest.schoolName] : [rest.bio, rest.certifications, rest.playingHistory],
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
      // The schema guarantees every sport has levels the coach picked.
      data: sports.map((sport) => {
        const levels = sportLevels.find((s) => s.sport === sport)!.levels as SkillLevel[];
        return { coachProfileId: profile.id, sport: sport as Sport, ...flagsFromLevels(levels) };
      }),
    }),
  ]);

  return NextResponse.json({ ok: true });
}
