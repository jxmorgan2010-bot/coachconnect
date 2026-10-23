import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { adminRefundSchema } from "@/lib/validation";
import { refundUnusedPackageSessions, RefundError } from "@/lib/refunds";

/** Admin refunds a package's unused sessions (on the parent's request). They can't be booked afterwards. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const parsed = adminRefundSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { id } = await params;
  try {
    const result = await refundUnusedPackageSessions({ packageId: id, ...parsed.data, adminUserId: admin.user.id });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof RefundError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Package refund failed", err);
    return NextResponse.json({ error: "The refund couldn't be processed with Stripe. Please try again." }, { status: 502 });
  }
}
