import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireCoachProfile } from "@/lib/session";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";

export async function POST() {
  if (!ENABLE_MINOR_COACHES) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  const profile = await requireCoachProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  if (!profile.isMinorCoach) {
    return NextResponse.json({ error: "Not applicable to this account." }, { status: 400 });
  }
  if (profile.minorGuardianConsentedAt) {
    return NextResponse.json({ error: "Consent has already been signed." }, { status: 409 });
  }

  const token = profile.minorConsentToken ?? randomBytes(16).toString("hex");
  if (!profile.minorConsentToken) {
    await prisma.coachProfile.update({ where: { id: profile.id }, data: { minorConsentToken: token } });
  }

  return NextResponse.json({ ok: true, token });
}
