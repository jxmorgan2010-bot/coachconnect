import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { ageIdentityVerificationSchema } from "@/lib/validation";

/** Records how an admin verified a coach's age and identity. Every coach, any age. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = ageIdentityVerificationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const profile = await prisma.coachProfile.findUnique({ where: { id } });
  if (!profile) {
    return NextResponse.json({ error: "Coach not found." }, { status: 404 });
  }

  const verifiedAt = new Date();
  await prisma.coachProfile.update({
    where: { id },
    data: {
      ageIdentityVerificationMethod: parsed.data.method,
      ageIdentityVerifiedAt: verifiedAt,
      ageIdentityVerifiedById: admin.user.id,
    },
  });

  return NextResponse.json({ ok: true, verifiedAt: verifiedAt.toISOString() });
}
