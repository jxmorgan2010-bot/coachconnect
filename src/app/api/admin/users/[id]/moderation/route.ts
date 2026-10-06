import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

/**
 * Admin undo for the contact-sharing policy — pattern matching will sometimes misfire.
 *
 * - reverse_suspension: lift the suspension and void the strike that caused it, leaving
 *   the earlier warning in place (strikes 2 → 1).
 * - clear_strikes: void every open strike, reset to 0, and lift any suspension.
 *
 * Voided attempts stay in the log (clearedAt/clearedBy) so the history isn't lost.
 * This never touches bookings or payments; an admin handles those by hand.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (action !== "reverse_suspension" && action !== "clear_strikes") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, strikeCount: true } });
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const now = new Date();
  const lift = { isSuspended: false, suspendedAt: null, suspensionReason: null };

  const result = await prisma.$transaction(async (tx) => {
    if (action === "clear_strikes") {
      await tx.flaggedAttempt.updateMany({
        where: { userId: id, blocked: true, clearedAt: null },
        data: { clearedAt: now, clearedById: admin.user.id },
      });
      return tx.user.update({ where: { id }, data: { ...lift, strikeCount: 0 } });
    }

    const latest = await tx.flaggedAttempt.findFirst({
      where: { userId: id, blocked: true, clearedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (latest) {
      await tx.flaggedAttempt.update({ where: { id: latest.id }, data: { clearedAt: now, clearedById: admin.user.id } });
    }
    return tx.user.update({
      where: { id },
      data: { ...lift, strikeCount: Math.max(0, user.strikeCount - (latest ? 1 : 0)) },
    });
  });

  return NextResponse.json({ ok: true, strikeCount: result.strikeCount, isSuspended: result.isSuspended });
}
