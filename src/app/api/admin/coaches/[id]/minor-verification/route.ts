import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { minorVerificationNoteSchema } from "@/lib/validation";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!ENABLE_MINOR_COACHES) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = minorVerificationNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const profile = await prisma.coachProfile.findUnique({ where: { id } });
  if (!profile || !profile.isMinorCoach) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  await prisma.coachProfile.update({
    where: { id },
    data: { minorBackgroundCheckNote: parsed.data.note },
  });

  return NextResponse.json({ ok: true });
}
