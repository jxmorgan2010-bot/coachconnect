import { prisma } from "@/lib/prisma";

export async function getCoachSessionsCompleted(coachProfileId: string): Promise<number> {
  return prisma.booking.count({ where: { coachProfileId, status: "COMPLETED" } });
}

/**
 * Average minutes between a parent's message and the coach's next reply in
 * the same thread, averaged across every thread the coach is part of.
 * Returns null when there's not enough message history yet.
 */
export async function getCoachAverageResponseMinutes(coachProfileId: string): Promise<number | null> {
  const threads = await prisma.thread.findMany({
    where: { coachProfileId },
    include: {
      coachProfile: { select: { userId: true } },
      messages: { orderBy: { createdAt: "asc" }, select: { senderId: true, createdAt: true } },
    },
  });

  const gapsMinutes: number[] = [];
  for (const thread of threads) {
    const coachUserId = thread.coachProfile.userId;
    const messages = thread.messages;
    for (let i = 0; i < messages.length - 1; i++) {
      const current = messages[i];
      const next = messages[i + 1];
      if (current.senderId !== coachUserId && next.senderId === coachUserId) {
        const minutes = (next.createdAt.getTime() - current.createdAt.getTime()) / (1000 * 60);
        gapsMinutes.push(minutes);
      }
    }
  }

  if (gapsMinutes.length === 0) return null;
  return gapsMinutes.reduce((sum, m) => sum + m, 0) / gapsMinutes.length;
}

export function formatResponseTime(minutes: number): string {
  if (minutes < 60) return `~${Math.max(1, Math.round(minutes))} min`;
  if (minutes < 60 * 24) return `~${Math.round(minutes / 60)} hr`;
  return `~${Math.round(minutes / (60 * 24))} days`;
}

/** Other children from this same family the coach has already worked with. */
export async function getSiblingsCoachedForFamily(
  coachProfileId: string,
  parentProfileId: string,
  currentChildId?: string,
): Promise<string[]> {
  const bookings = await prisma.booking.findMany({
    where: {
      coachProfileId,
      parentProfileId,
      status: { in: ["CONFIRMED", "COMPLETED"] },
      childId: { not: null },
    },
    include: { child: { select: { id: true, firstName: true } } },
  });

  const names = new Map<string, string>();
  for (const b of bookings) {
    if (!b.child) continue;
    if (currentChildId && b.child.id === currentChildId) continue;
    names.set(b.child.id, b.child.firstName);
  }
  return Array.from(names.values());
}
