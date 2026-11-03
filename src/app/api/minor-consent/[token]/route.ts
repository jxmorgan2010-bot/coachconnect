import { NextResponse } from "next/server";
import { minorConsentSignSchema } from "@/lib/validation";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import { completeConsent, clientIp, revokeLink, MinorConsentError } from "@/lib/minorConsent";
import { queueEmail } from "@/lib/email";
import { consentRecordedEmail } from "@/lib/emails";
import { notifyIfCoachAwaitingReview } from "@/lib/notify";

/** The parent/guardian signs. Single-use: see completeConsent. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!ENABLE_MINOR_COACHES) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  const { token } = await params;
  const body = await req.json().catch(() => null);
  const parsed = minorConsentSignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  let result;
  try {
    result = await completeConsent(token, parsed.data, {
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
  } catch (err) {
    if (err instanceof MinorConsentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const link = revokeLink(result.revokeToken);
  queueEmail(
    consentRecordedEmail({
      to: result.consent.guardianEmail,
      signerName: parsed.data.signerLegalName,
      coachName: result.consent.coachProfile.user.name,
      revokeLink: link,
    }),
  );
  // Guardian consent is one of the minor coach's own onboarding steps.
  notifyIfCoachAwaitingReview(result.consent.coachProfile.userId);

  return NextResponse.json({ ok: true, revokeLink: link });
}
