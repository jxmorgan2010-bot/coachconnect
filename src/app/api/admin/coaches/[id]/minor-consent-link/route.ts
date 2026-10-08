import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { ENABLE_MINOR_COACHES } from "@/lib/flags";
import { reissueConsentLink, reissueRevokeLink, consentLink, revokeLink, MinorConsentError } from "@/lib/minorConsent";

/**
 * Email is mocked, so admins send links by hand. Only token hashes are stored, so this
 * issues a NEW link (replacing the previous one of that kind) and returns it once.
 * kind "consent": a fresh signing link to the parent/guardian the coach named.
 * kind "revoke":  a fresh withdrawal link for a signed consent.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!ENABLE_MINOR_COACHES) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const kind = body?.kind;
  if (kind !== "consent" && kind !== "revoke") {
    return NextResponse.json({ error: "Invalid link type." }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  try {
    if (kind === "consent") {
      const { token, consent } = await reissueConsentLink(id);
      const link = consentLink(origin, token);
      console.log(`[minor consent] admin issued consent link for ${consent.guardianEmail}: ${link}`);
      return NextResponse.json({ ok: true, link, sendTo: consent.guardianEmail, expiresAt: consent.expiresAt.toISOString() });
    }
    const { revokeToken, consent } = await reissueRevokeLink(id);
    const link = revokeLink(origin, revokeToken);
    console.log(`[minor consent] admin issued withdrawal link for ${consent.guardianEmail}: ${link}`);
    return NextResponse.json({ ok: true, link, sendTo: consent.guardianEmail, expiresAt: null });
  } catch (err) {
    if (err instanceof MinorConsentError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
