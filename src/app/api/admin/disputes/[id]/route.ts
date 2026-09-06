import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { refundCapturedPayment } from "@/lib/payment";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action = body?.action;
  const adminNote = typeof body?.adminNote === "string" ? body.adminNote.trim() || null : null;

  const dispute = await prisma.dispute.findUnique({ where: { id }, include: { booking: true } });
  if (!dispute) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  if (action === "refund") {
    if (dispute.booking.paymentStatus !== "CAPTURED") {
      return NextResponse.json({ error: "There's no captured payment on this session to refund." }, { status: 400 });
    }
    const refundCents = Math.round(Number(body?.refundCents));
    if (!Number.isFinite(refundCents) || refundCents <= 0) {
      return NextResponse.json({ error: "Enter a valid refund amount." }, { status: 400 });
    }
    try {
      await refundCapturedPayment(dispute.booking.stripePaymentIntentId, refundCents);
    } catch (err) {
      console.error("Stripe refund failed", err);
      return NextResponse.json({ error: "The refund couldn't be processed with Stripe. Please try again." }, { status: 502 });
    }
    await prisma.$transaction([
      prisma.dispute.update({
        where: { id },
        data: { status: "REFUNDED", refundCents, adminNote, resolvedAt: new Date() },
      }),
      prisma.booking.update({ where: { id: dispute.bookingId }, data: { paymentStatus: "REFUNDED" } }),
    ]);
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
