import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { adminWaiveSchema } from "@/lib/validation";
import { waiveLateCancel, RefundError } from "@/lib/refunds";

/** Admin waives a late-cancellation charge without a parent case (emergencies, weather). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const parsed = adminWaiveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { id } = await params;
  try {
    const result = await waiveLateCancel({ bookingId: id, reason: parsed.data.reason, adminUserId: admin.user.id });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof RefundError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Late-cancel waiver failed", err);
    return NextResponse.json({ error: "The refund couldn't be processed with Stripe. Please try again." }, { status: 502 });
  }
}
