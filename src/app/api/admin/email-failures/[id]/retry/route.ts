import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { retryEmailFailure } from "@/lib/emailRetry";

/** Resend an email that never went out ("Email problems" on /admin/jobs). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const { id } = await params;
  const outcome = await retryEmailFailure(id, admin.user.id);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
