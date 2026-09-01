import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;

  await prisma.$transaction([
    prisma.coachProfile.update({ where: { id }, data: { isSuspended: false, suspendedAt: null } }),
    prisma.report.updateMany({
      where: { targetType: "COACH_PROFILE", targetId: id, status: "OPEN" },
      data: { status: "REVIEWED" },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
