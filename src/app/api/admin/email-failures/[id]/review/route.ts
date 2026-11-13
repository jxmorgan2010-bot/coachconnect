import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { markEmailFailureReviewed } from "@/lib/emailFailureStore";

/** An admin has handled an email that never went out (/admin/jobs). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const { id } = await params;
  if (!(await markEmailFailureReviewed(id, admin.user.id))) {
    return NextResponse.json({ error: "Already resolved, or not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
