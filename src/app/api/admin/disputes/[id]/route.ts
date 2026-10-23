import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { adminRefundSchema, adminWaiveSchema } from "@/lib/validation";
import { refundBooking, waiveLateCancel, RefundError } from "@/lib/refunds";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action = body?.action;
  const adminNote = typeof body?.adminNote === "string" ? body.adminNote.trim() || null : null;

  const dispute = await prisma.dispute.findUnique({ where: { id } });
  if (!dispute) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  if (action === "refund" || action === "waive") {
    try {
      if (action === "refund") {
        const parsed = adminRefundSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
        }
        await refundBooking({ bookingId: dispute.bookingId, ...parsed.data, adminUserId: admin.user.id });
      } else {
        const parsed = adminWaiveSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
        }
        await waiveLateCancel({ bookingId: dispute.bookingId, reason: parsed.data.reason, adminUserId: admin.user.id });
      }
    } catch (err) {
      if (err instanceof RefundError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      console.error("Stripe refund failed", err);
      return NextResponse.json({ error: "The refund couldn't be processed with Stripe. Please try again." }, { status: 502 });
    }
    if (adminNote) await prisma.dispute.update({ where: { id }, data: { adminNote } });
  } else if (action === "side_with_coach") {
    await prisma.dispute.update({
      where: { id },
      data: { status: "SIDED_WITH_COACH", adminNote, resolvedAt: new Date() },
    });
  } else if (action === "request_info") {
    await prisma.dispute.update({
      where: { id },
      data: { status: "INFO_REQUESTED", adminNote },
    });
  } else if (action === "dismiss") {
    await prisma.dispute.update({
      where: { id },
      data: { status: "DISMISSED", adminNote, resolvedAt: new Date() },
    });
  } else {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
