import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { REPORT_SUSPEND_THRESHOLD } from "@/lib/coach";

async function resolveCoachProfileId(targetType: string, targetId: string): Promise<string | null> {
  if (targetType === "COACH_PROFILE") return targetId;
  if (targetType === "MESSAGE") {
    const thread = await prisma.thread.findUnique({ where: { id: targetId }, select: { coachProfileId: true } });
    return thread?.coachProfileId ?? null;
  }
  return null;
}

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Please sign in to submit a report." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const targetType = body?.targetType;
  const targetId = body?.targetId;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (
    (targetType !== "COACH_PROFILE" && targetType !== "PARENT_PROFILE" && targetType !== "MESSAGE") ||
    typeof targetId !== "string" ||
    !targetId ||
    reason.length < 5
  ) {
    return NextResponse.json({ error: "Please provide a reason for the report." }, { status: 400 });
  }

  await prisma.report.create({
    data: {
      reporterId: session.user.id,
      targetType,
      targetId,
      reason,
      details: typeof body?.details === "string" ? body.details.trim() : null,
    },
  });

  const coachProfileId = await resolveCoachProfileId(targetType, targetId);
  if (coachProfileId) {
    const coach = await prisma.coachProfile.findUnique({
      where: { id: coachProfileId },
      select: { isSuspended: true },
    });

    if (coach && !coach.isSuspended) {
      const threadIds = (
        await prisma.thread.findMany({ where: { coachProfileId }, select: { id: true } })
      ).map((t) => t.id);

      const openReportCount = await prisma.report.count({
        where: {
          status: "OPEN",
          OR: [
            { targetType: "COACH_PROFILE", targetId: coachProfileId },
            ...(threadIds.length ? [{ targetType: "MESSAGE" as const, targetId: { in: threadIds } }] : []),
          ],
        },
      });

      if (openReportCount >= REPORT_SUSPEND_THRESHOLD) {
        await prisma.coachProfile.update({
          where: { id: coachProfileId },
          data: { isSuspended: true, suspendedAt: new Date() },
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
