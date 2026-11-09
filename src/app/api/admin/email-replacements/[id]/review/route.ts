import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { markEmailReplacementReviewed } from "@/lib/emailReplacementStore";

/** An admin has looked at text that was replaced in a sent email (/admin/jobs). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const { id } = await params;
  if (!(await markEmailReplacementReviewed(id, admin.user.id))) {
    return NextResponse.json({ error: "Already reviewed, or not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
