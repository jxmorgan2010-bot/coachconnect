import { NextResponse } from "next/server";
import { minorConsentSignSchema } from "@/lib/validation";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import { completeConsent, clientIp, revokeLink, MinorConsentError } from "@/lib/minorConsent";
import { sendMockEmail } from "@/lib/mockEmail";

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

  const link = revokeLink(new URL(req.url).origin, result.revokeToken);
  sendMockEmail(
    result.consent.guardianEmail,
    "Your consent is recorded — keep this email",
    `Thanks, ${parsed.data.signerLegalName}. Your consent for ${result.consent.coachProfile.user.name} to coach on CoachConnect is recorded.\n\nYou can withdraw it at any time with this link, which doesn't expire:\n\n${link}`,
  );

  return NextResponse.json({ ok: true, revokeLink: link });
}
