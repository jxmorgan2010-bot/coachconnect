import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { trainingPlanToggleSchema } from "@/lib/validation";

/** Toggling done/not-done is allowed for the owning coach or the child's own parent. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const item = await prisma.trainingPlanItem.findUnique({
    where: { id },
    include: { coachProfile: true, child: { include: { parentProfile: true } } },
  });
  if (!item) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const isOwningCoach = item.coachProfile.userId === session.user.id;
  const isParent = item.child.parentProfile.userId === session.user.id;
  if (!isOwningCoach && !isParent) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = trainingPlanToggleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const updated = await prisma.trainingPlanItem.update({
    where: { id },
    data: { isDone: parsed.data.isDone, completedAt: parsed.data.isDone ? new Date() : null },
  });

  return NextResponse.json({ ok: true, item: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "COACH") {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const item = await prisma.trainingPlanItem.findUnique({ where: { id }, include: { coachProfile: true } });
  if (!item || item.coachProfile.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  await prisma.trainingPlanItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
