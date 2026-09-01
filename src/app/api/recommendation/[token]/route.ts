import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recommendationSubmitSchema } from "@/lib/validation";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const recommendation = await prisma.recommendation.findUnique({
    where: { token },
    include: { coachProfile: { include: { user: true } } },
  });
  if (!recommendation) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({
    coachName: recommendation.coachProfile.user.name,
    status: recommendation.status,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => null);
  const parsed = recommendationSubmitSchema.safeParse({ ...body, token });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const recommendation = await prisma.recommendation.findUnique({ where: { token } });
  if (!recommendation) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (recommendation.status === "SUBMITTED") {
    return NextResponse.json({ error: "This recommendation has already been submitted." }, { status: 409 });
  }

  await prisma.recommendation.update({
    where: { token },
    data: {
      recommenderName: parsed.data.recommenderName,
      recommenderRole: parsed.data.recommenderRole,
      content: parsed.data.content,
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
