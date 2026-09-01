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
  const status = body?.status;
  if (status !== "REVIEWED" && status !== "DISMISSED") {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  await prisma.report.update({ where: { id }, data: { status } });
  return NextResponse.json({ ok: true });
}
