import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { messageSchema } from "@/lib/validation";
import { enforceContactPolicy, rejectIfSuspended } from "@/lib/contactPolicy";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const thread = await prisma.thread.findUnique({
    where: { id },
    include: { parentProfile: true, coachProfile: true },
  });
  if (!thread) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const isParentSide = thread.parentProfile.userId === session.user.id;
  const isCoachSide = thread.coachProfile.userId === session.user.id;
  if (!isParentSide && !isCoachSide) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const suspended = await rejectIfSuspended(session.user.id);
  if (suspended) return suspended;

  const body = await req.json().catch(() => null);
  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  // Blocked messages are never saved, so the other side never receives them.
  const blocked = await enforceContactPolicy({ userId: session.user.id, context: "MESSAGE", fields: [parsed.data.body] });
  if (blocked) return blocked;

  const message = await prisma.message.create({
    data: { threadId: thread.id, senderId: session.user.id, body: parsed.data.body },
  });

  return NextResponse.json({ ok: true, message });
}
