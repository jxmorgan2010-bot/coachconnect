import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { coachRegisterSchema } from "@/lib/validation";
import { evaluateCoachAgeEligibility } from "@/lib/coach";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = coachRegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { name, email, password, dateOfBirth } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const eligibility = evaluateCoachAgeEligibility(dateOfBirth);
  if (!eligibility.ok) {
    return NextResponse.json({ error: eligibility.reason }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      passwordHash,
      role: "COACH",
      coachProfile: {
        create: {
          dateOfBirth,
          isMinorCoach: eligibility.isMinor,
        },
      },
    },
  });

  return NextResponse.json({ ok: true });
}
