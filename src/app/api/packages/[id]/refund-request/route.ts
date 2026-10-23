import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { enforceContactPolicy } from "@/lib/contactPolicy";
import { packageRefundRequestSchema } from "@/lib/validation";
import { sessionsLeft } from "@/lib/bundles";

/**
 * Parent asks for a refund of a package's unused sessions. Lands in admin Reports; the
 * refund itself is done by an admin from /admin/refunds.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const pkg = await prisma.sessionPackage.findUnique({ where: { id }, include: { parentProfile: true } });
  if (!pkg || pkg.parentProfile.userId !== session.user.id) {
    return NextResponse.json({ error: "Package not found." }, { status: 404 });
  }
  if (sessionsLeft(pkg) <= 0) {
    return NextResponse.json({ error: "This package has no unused sessions to refund." }, { status: 400 });
  }
  const open = await prisma.report.findFirst({ where: { targetType: "SESSION_PACKAGE", targetId: pkg.id, status: "OPEN" } });
  if (open) {
    return NextResponse.json({ error: "You've already asked. An admin will get back to you." }, { status: 409 });
  }

  const parsed = packageRefundRequestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }
  // Admin-only channel, same as disputes: logged if it looks like contact details, never blocked.
  await enforceContactPolicy({ userId: session.user.id, context: "DISPUTE", fields: [parsed.data.details] });

  await prisma.report.create({
    data: {
      reporterId: session.user.id,
      targetType: "SESSION_PACKAGE",
      targetId: pkg.id,
      reason: `Refund of ${sessionsLeft(pkg)} unused package session${sessionsLeft(pkg) === 1 ? "" : "s"}`,
      details: parsed.data.details || null,
    },
  });
  return NextResponse.json({ ok: true });
}
