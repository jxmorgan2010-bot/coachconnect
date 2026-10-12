import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { childLevelSchema } from "@/lib/validation";
import type { SkillLevel, Sport } from "@/generated/prisma/client";

/**
 * Sets one child's level in one sport (creating or replacing it). Used by the family page,
 * the booking form and quick rebook. Only the child's own parent can set it.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const child = await prisma.child.findUnique({ where: { id }, include: { parentProfile: true } });
  if (!child || child.parentProfile.userId !== session.user.id) {
    return NextResponse.json({ error: "Child not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = childLevelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  const sport = parsed.data.sport as Sport;
  const level = parsed.data.level as SkillLevel;

  const saved = await prisma.childSportLevel.upsert({
    where: { childId_sport: { childId: child.id, sport } },
    create: { childId: child.id, sport, level },
    update: { level },
  });

  return NextResponse.json({ ok: true, level: { sport: saved.sport, level: saved.level } });
}
