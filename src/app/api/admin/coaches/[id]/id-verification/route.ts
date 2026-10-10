import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import { setIdVerificationStatus, MinorConsentError } from "@/lib/minorConsent";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  // Approving a minor coach requires completed, unrevoked guardian consent — enforced in
  // setIdVerificationStatus, not just by hiding the button.
  try {
    await setIdVerificationStatus(id, status, { minorCoachesEnabled: ENABLE_MINOR_COACHES });
  } catch (err) {
    if (err instanceof MinorConsentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}
