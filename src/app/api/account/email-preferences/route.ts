import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { emailPreferencesSchema } from "@/lib/validation";

/** Parents and coaches turn new-message emails on or off. Account and booking emails always send. */
export async function PATCH(req: Request) {
  const session = await getCurrentSession();
  if (!session?.user || (session.user.role !== "PARENT" && session.user.role !== "COACH")) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const parsed = emailPreferencesSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { messageEmailAlerts: parsed.data.messageEmailAlerts },
  });
  return NextResponse.json({ ok: true });
}
