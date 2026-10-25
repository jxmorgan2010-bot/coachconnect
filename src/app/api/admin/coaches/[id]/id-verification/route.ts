import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/session";
import { idReviewCookieName, isIdReviewTokenValid } from "@/lib/idReview";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import { setIdVerificationStatus, MinorConsentError } from "@/lib/minorConsent";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const status = body?.status;
  if (status !== "APPROVED" && status !== "REJECTED") {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  // Approving requires that this admin opened the coach's current ID (the cookie set by the ID
  // photo route), and for a minor coach completed, unrevoked guardian consent — both enforced in
  // setIdVerificationStatus, not just by disabling the button.
  const reviewToken = req.cookies.get(idReviewCookieName(id))?.value;
  try {
    await setIdVerificationStatus(id, status, {
      minorCoachesEnabled: ENABLE_MINOR_COACHES,
      isCurrentIdViewed: (idPhotoPath) =>
        isIdReviewTokenValid(reviewToken, { adminUserId: admin.user.id, coachProfileId: id, idPhotoPath }),
    });
  } catch (err) {
    if (err instanceof MinorConsentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}
