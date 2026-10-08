import { NextResponse } from "next/server";
import { revokeConsent, clientIp, MinorConsentError } from "@/lib/minorConsent";

/**
 * The parent/guardian withdraws consent. Intentionally NOT gated on ENABLE_MINOR_COACHES:
 * withdrawing must keep working even if the tier is switched off later.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const result = await revokeConsent(token, { ip: clientIp(req), userAgent: req.headers.get("user-agent") });
    return NextResponse.json({
      ok: true,
      alreadyRevoked: result.alreadyRevoked,
      cancelledSessions: result.cancelledBookingIds.length,
    });
  } catch (err) {
    if (err instanceof MinorConsentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
