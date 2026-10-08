import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { coachRegisterSchema } from "@/lib/validation";
import { evaluateCoachAgeEligibility } from "@/lib/coach";
import { calendarDateToStoredDate } from "@/lib/age";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = coachRegisterSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const outOfArea = issue?.path[0] === "zip";
    return NextResponse.json({ error: issue?.message ?? "Invalid input.", outOfArea }, { status: 400 });
  }

  const { name, email, password, dateOfBirth, zip } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  // Nothing is stored for an applicant who isn't eligible. UNDER_18_NOT_ACCEPTED (the
  // Minor Coach tier is off) is a notice, not a failure — signup shows it as one.
  const eligibility = evaluateCoachAgeEligibility(dateOfBirth);
  if (!eligibility.ok) {
    return NextResponse.json({ error: eligibility.reason, code: eligibility.code }, { status: 422 });
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
          dateOfBirth: calendarDateToStoredDate(dateOfBirth),
          isMinorCoach: eligibility.isMinor,
          zip,
        },
      },
    },
  });

  return NextResponse.json({ ok: true, isMinorCoach: eligibility.isMinor });
}
