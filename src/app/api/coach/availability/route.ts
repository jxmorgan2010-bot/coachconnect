import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCoachProfile } from "@/lib/session";
import { availabilitySchema } from "@/lib/validation";

export async function PATCH(req: Request) {
  const profile = await requireCoachProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = availabilitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.availability.deleteMany({ where: { coachProfileId: profile.id } }),
    prisma.availability.createMany({
      data: parsed.data.slots.map((slot) => ({ ...slot, coachProfileId: profile.id })),
    }),
  ]);

  return NextResponse.json({ ok: true });
}
