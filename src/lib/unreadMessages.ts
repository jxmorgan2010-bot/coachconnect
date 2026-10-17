import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/** Threads the user is on, as the parent or as the coach. */
function threadsOf(userId: string): Prisma.ThreadWhereInput {
  return { OR: [{ parentProfile: { userId } }, { coachProfile: { userId } }] };
}

/** Messages the other side sent that this user hasn't opened yet. */
export function unreadFor(userId: string): Prisma.MessageWhereInput {
  return { readAt: null, senderId: { not: userId } };
}

/** The navbar badge: conversations with at least one unread message, plus the message total. */
export async function countUnread(userId: string) {
  const [threads, messages] = await Promise.all([
    prisma.thread.count({ where: { ...threadsOf(userId), messages: { some: unreadFor(userId) } } }),
    prisma.message.count({ where: { ...unreadFor(userId), thread: threadsOf(userId) } }),
  ]);
  return { threads, messages };
}

/** Marks everything the other side sent in this thread as read. Returns how many changed. */
export async function markThreadRead(threadId: string, userId: string) {
  const { count } = await prisma.message.updateMany({
    where: { threadId, ...unreadFor(userId) },
    data: { readAt: new Date() },
  });
  return count;
}
