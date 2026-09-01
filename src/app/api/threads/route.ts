import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Only parent accounts can start a conversation." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const coachProfileId = body?.coachProfileId;
  if (typeof coachProfileId !== "string" || !coachProfileId) {
    return NextResponse.json({ error: "Missing coach." }, { status: 400 });
  }

  const parentProfile = await prisma.parentProfile.findUnique({ where: { userId: session.user.id } });
  if (!parentProfile) {
    return NextResponse.json({ error: "Parent profile not found." }, { status: 404 });
  }

  const coach = await prisma.coachProfile.findUnique({ where: { id: coachProfileId } });
  if (!coach) {
    return NextResponse.json({ error: "Coach not found." }, { status: 404 });
  }

  const thread = await prisma.thread.upsert({
    where: { parentProfileId_coachProfileId: { parentProfileId: parentProfile.id, coachProfileId } },
    update: {},
    create: { parentProfileId: parentProfile.id, coachProfileId },
  });

  return NextResponse.json({ ok: true, threadId: thread.id });
}
