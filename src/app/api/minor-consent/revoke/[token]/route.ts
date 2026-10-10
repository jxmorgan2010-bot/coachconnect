import { NextResponse, after } from "next/server";
import {
  revokeConsent,
  recheckBookingsAfterRevocation,
  clientIp,
  MinorConsentError,
  REVOCATION_RECHECK_DELAY_MS,
} from "@/lib/minorConsent";

// Covers the delayed re-check below, which runs ~30s after the response is sent.
export const maxDuration = 60;

/**
 * The parent/guardian withdraws consent. Intentionally NOT gated on ENABLE_MINOR_COACHES:
 * withdrawing must keep working even if the tier is switched off later.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let result;
  try {
    result = await revokeConsent(token, { ip: clientIp(req), userAgent: req.headers.get("user-agent") });
  } catch (err) {
    if (err instanceof MinorConsentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // A booking whose Stripe call was still in flight when consent was withdrawn can be
  // written after revokeConsent's own re-check. Look once more, after the parent has
  // their answer, and handle any such booking the same way.
  const { coachProfileId, revokedAt } = result;
  if (revokedAt) {
    after(async () => {
      await new Promise((resolve) => setTimeout(resolve, REVOCATION_RECHECK_DELAY_MS));
      try {
        const late = await recheckBookingsAfterRevocation(coachProfileId, revokedAt);
        if (late.cancelledBookingIds.length > 0) {
          console.log(`[minor consent] delayed re-check cancelled ${late.cancelledBookingIds.length} booking(s) for coach ${coachProfileId}`);
        }
      } catch (err) {
        console.error(`[minor consent] delayed re-check failed for coach ${coachProfileId}`, err);
      }
    });
  }

  return NextResponse.json({
    ok: true,
    alreadyRevoked: result.alreadyRevoked,
    cancelledSessions: result.cancelledBookingIds.length,
  });
}
