import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { minorGuardianConsentSchema } from "@/lib/validation";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!ENABLE_MINOR_COACHES) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  const { token } = await params;
  const body = await req.json().catch(() => null);
  const parsed = minorGuardianConsentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const profile = await prisma.coachProfile.findUnique({ where: { minorConsentToken: token } });
  if (!profile || !profile.isMinorCoach) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (profile.minorGuardianConsentedAt) {
    return NextResponse.json({ error: "This consent has already been signed." }, { status: 409 });
  }

  await prisma.coachProfile.update({
    where: { minorConsentToken: token },
    data: {
      minorGuardianName: parsed.data.guardianName,
      minorGuardianRelationship: parsed.data.guardianRelationship,
      minorGuardianEmail: parsed.data.guardianEmail,
      minorGuardianConsentedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
