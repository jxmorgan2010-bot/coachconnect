import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { setContacted } from "@/lib/teenInterestStore";

/** The "Contacted" checkbox on /admin/teen-interest. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { contacted?: unknown } | null;
  if (typeof body?.contacted !== "boolean") {
    return NextResponse.json({ error: "Send contacted: true or false." }, { status: 400 });
  }
  const { id } = await params;
  if (!(await setContacted(id, body.contacted))) {
    return NextResponse.json({ error: "That entry was removed." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
