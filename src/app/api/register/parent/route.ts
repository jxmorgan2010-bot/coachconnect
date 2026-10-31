import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { parentRegisterSchema } from "@/lib/validation";
import { generateReferralCode } from "@/lib/referral";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = parentRegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { name, email, password, phone, referralCode } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  let referrer: { id: string } | null = null;
  if (referralCode) {
    referrer = await prisma.parentProfile.findUnique({
      where: { referralCode: referralCode.trim().toUpperCase() },
      select: { id: true },
    });
    if (!referrer) {
      return NextResponse.json({ error: "That referral code doesn't look right." }, { status: 400 });
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);

  let ownCode = generateReferralCode();
  while (await prisma.parentProfile.findUnique({ where: { referralCode: ownCode } })) {
    ownCode = generateReferralCode();
  }

  // Signing up with a code gives nothing yet. Both credits are decided at this parent's first
  // completed, card-paid session (settleReferral in lib/referral.ts).
  await prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      passwordHash,
      role: "PARENT",
      parentProfile: {
        create: {
          phone: phone || null,
          referralCode: ownCode,
          referredById: referrer?.id,
          referralPending: !!referrer,
        },
      },
    },
  });

  return NextResponse.json({ ok: true });
}
