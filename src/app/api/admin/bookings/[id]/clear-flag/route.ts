import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/**
 * An admin has dealt with a booking a scheduled job flagged (/admin/jobs). Clearing a
 * CHARGE_FAILED flag on a still-CONFIRMED booking lets the next auto-release run try the charge
 * again (for example after the parent updated their card in Stripe).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const { id } = await params;
  const { count } = await prisma.booking.updateMany({
    where: { id, adminFlag: { not: null } },
    data: { adminFlag: null, adminFlaggedAt: null },
  });
  if (count !== 1) return NextResponse.json({ error: "That booking isn't flagged." }, { status: 404 });
  console.log(`[jobs] admin ${admin.user.id} cleared the flag on booking ${id}`);
  return NextResponse.json({ ok: true });
}
