import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { coachRegisterSchema } from "@/lib/validation";
import { evaluateCoachAgeEligibility } from "@/lib/coach";
import { calendarDateToStoredDate, describeCalendarDate, todayInPacific } from "@/lib/age";
import { EXPERIENCED_COACHES_ENABLED } from "@/lib/features";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import { isTeenInterestAge, turns18OnFor } from "@/lib/teenInterest";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = coachRegisterSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const outOfArea = issue?.path[0] === "zip";
    return NextResponse.json({ error: issue?.message ?? "Invalid input.", outOfArea }, { status: 400 });
  }

  const { name, email, password, dateOfBirth, zip, coachType } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  // Signup only offers the choice while the switch is on; this stops a hand-made request.
  if (coachType === "EXPERIENCED" && !EXPERIENCED_COACHES_ENABLED) {
    return NextResponse.json({ error: "Assist Coaching isn't accepting experienced coaches yet." }, { status: 403 });
  }

  // Nothing is stored for an applicant who isn't eligible. UNDER_18_NOT_ACCEPTED (the
  // Minor Coach tier is off) and EXPERIENCED_UNDER_18 are notices, not failures — signup
  // shows them as such.
  const eligibility = evaluateCoachAgeEligibility(dateOfBirth, { coachType });
  if (!eligibility.ok) {
    // 16–17 while the Minor Coach tier is off: signup offers the teen interest list instead
    // (src/lib/teenInterest.ts). Still nothing is saved here.
    const interestList = isTeenInterestAge(dateOfBirth, todayInPacific(), ENABLE_MINOR_COACHES);
    return NextResponse.json(
      {
        error: eligibility.reason,
        code: eligibility.code,
        ...(interestList ? { interestList: true, turns18On: describeCalendarDate(turns18OnFor(dateOfBirth)) } : {}),
      },
      { status: 422 },
    );
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
          coachType,
          zip,
        },
      },
    },
  });

  return NextResponse.json({ ok: true, isMinorCoach: eligibility.isMinor });
}
