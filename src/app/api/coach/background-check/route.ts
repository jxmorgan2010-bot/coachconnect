import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCoachProfile } from "@/lib/session";
import { generateMockCheckRef, simulateBackgroundCheckResult } from "@/lib/backgroundCheck";
import { backgroundCheckExpiryDate } from "@/lib/coach";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Initiates a mock Checkr-style background check and, since this is a
 * local/dev mock with no real webhook, resolves it in the same request
 * after a short simulated processing delay.
 */
export async function POST() {
  const profile = await requireCoachProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const ref = generateMockCheckRef();
  await prisma.coachProfile.update({
    where: { id: profile.id },
    data: { backgroundCheckStatus: "PENDING", backgroundCheckRef: ref },
  });

  await delay(1200);

  const result = simulateBackgroundCheckResult();
  const updated = await prisma.coachProfile.update({
    where: { id: profile.id },
    data: {
      backgroundCheckStatus: result,
      backgroundCheckExpiresAt: result === "CLEAR" ? backgroundCheckExpiryDate() : null,
    },
  });

  return NextResponse.json({
    ok: true,
    status: updated.backgroundCheckStatus,
    expiresAt: updated.backgroundCheckExpiresAt,
  });
}
