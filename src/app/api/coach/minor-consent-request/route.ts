import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCoachProfile } from "@/lib/session";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import { minorConsentRequestSchema } from "@/lib/validation";
import { createConsentRequest, consentLink, MinorConsentError, CONSENT_LINK_TTL_DAYS } from "@/lib/minorConsent";
import { sendMockEmail } from "@/lib/mockEmail";

/**
 * The teen names their parent/guardian and a consent link is "emailed" to them. Also how
 * the teen requests a new link: the previous pending one stops working. The link is
 * deliberately not returned to the teen — only the parent should be able to open it.
 */
export async function POST(req: Request) {
  if (!ENABLE_MINOR_COACHES) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  const profile = await requireCoachProfile();
  if (!profile) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = minorConsentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  let result;
  try {
    result = await createConsentRequest({ coachProfileId: profile.id, ...parsed.data });
  } catch (err) {
    if (err instanceof MinorConsentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: profile.userId } });
  const link = consentLink(new URL(req.url).origin, result.token);
  sendMockEmail(
    result.consent.guardianEmail,
    `${user.name} needs your consent to coach on CoachConnect`,
    `Hi ${result.consent.guardianName},\n\n${user.name} has applied to coach on CoachConnect. Because they're under 18, they need their parent or legal guardian's consent. Please read and sign here (the link works once and expires in ${CONSENT_LINK_TTL_DAYS} days):\n\n${link}`,
  );

  return NextResponse.json({
    ok: true,
    consent: {
      status: "PENDING",
      guardianName: result.consent.guardianName,
      guardianEmail: result.consent.guardianEmail,
      requestedAt: result.consent.createdAt.toISOString(),
      expiresAt: result.consent.expiresAt.toISOString(),
    },
  });
}
