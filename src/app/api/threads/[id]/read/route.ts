import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { markThreadRead } from "@/lib/unreadMessages";

// Called from the thread page once it is actually open in the browser — not during the
// server render, so a prefetched link can never mark a conversation read.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const thread = await prisma.thread.findUnique({
    where: { id },
    select: { parentProfile: { select: { userId: true } }, coachProfile: { select: { userId: true } } },
  });
  if (!thread) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  // Only the two people in the conversation. An admin reviewing a reported thread must not
  // clear the parent's or coach's unread alerts.
  const isParticipant =
    thread.parentProfile.userId === session.user.id || thread.coachProfile.userId === session.user.id;
  if (!isParticipant) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const marked = await markThreadRead(id, session.user.id);
  return NextResponse.json({ ok: true, marked });
}
