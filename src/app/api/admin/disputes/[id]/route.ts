import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

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

  if (action === "refund") {
    const refundCents = Math.round(Number(body?.refundCents));
    if (!Number.isFinite(refundCents) || refundCents <= 0) {
      return NextResponse.json({ error: "Enter a valid refund amount." }, { status: 400 });
    }
    await prisma.dispute.update({
      where: { id },
      data: { status: "REFUNDED", refundCents, adminNote, resolvedAt: new Date() },
    });
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
