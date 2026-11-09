import type { CalendarFeed, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { toCalendarSession, type CalendarSession, type CalendarViewer } from "@/lib/calendar";
import { FEED_MAX_EVENTS, FEED_PAST_DAYS, FEED_RATE_LIMIT, FEED_RATE_WINDOW_MS, newFeedToken, parseChildIds } from "@/lib/calendarFeed";

/** The database side of private calendar feeds. The rules are described in src/lib/calendarFeed.ts. */

/** Creates the user's feed, or gives it a new secret (the old link stops working). Returns the new token. */
export async function createOrResetFeed(userId: string, now = new Date()): Promise<{ token: string; reset: boolean }> {
  const { token, tokenHash } = newFeedToken();
  const existing = await prisma.calendarFeed.findUnique({ where: { userId }, select: { id: true } });
  if (existing) {
    await prisma.calendarFeed.update({
      where: { userId },
      data: { tokenHash, resetAt: now, rateWindowStart: null, rateWindowCount: 0 },
    });
    return { token, reset: true };
  }
  await prisma.calendarFeed.create({ data: { userId, tokenHash, createdAt: now } });
  return { token, reset: false };
}

export type RateDecision = { ok: true } | { ok: false; retryAfterSeconds: number };

/** Counts this request against the feed's hourly limit. */
export async function takeFeedRequest(feed: CalendarFeed, now = new Date()): Promise<RateDecision> {
  const start = feed.rateWindowStart;
  if (!start || now.getTime() - start.getTime() >= FEED_RATE_WINDOW_MS) {
    await prisma.calendarFeed.update({
      where: { id: feed.id },
      data: { rateWindowStart: now, rateWindowCount: 1, lastFetchedAt: now },
    });
    return { ok: true };
  }
  if (feed.rateWindowCount >= FEED_RATE_LIMIT) {
    const retryAfterSeconds = Math.max(1, Math.ceil((start.getTime() + FEED_RATE_WINDOW_MS - now.getTime()) / 1000));
    return { ok: false, retryAfterSeconds };
  }
  await prisma.calendarFeed.update({
    where: { id: feed.id },
    data: { rateWindowCount: { increment: 1 }, lastFetchedAt: now },
  });
  return { ok: true };
}

const sessionInclude = {
  child: { select: { firstName: true } },
  coachProfile: { select: { user: { select: { name: true } } } },
} as const;

/**
 * The sessions a feed shows: the last FEED_PAST_DAYS days and everything after, for the parent's
 * chosen children (or all of them), or for the coach.
 */
export async function feedSessions(
  feed: Pick<CalendarFeed, "userId" | "childIds">,
  now = new Date(),
): Promise<{ viewer: CalendarViewer; sessions: CalendarSession[] } | null> {
  const user = await prisma.user.findUnique({
    where: { id: feed.userId },
    select: { role: true, parentProfile: { select: { id: true } }, coachProfile: { select: { id: true } } },
  });
  if (!user) return null;
  const since = new Date(now.getTime() - FEED_PAST_DAYS * 24 * 60 * 60 * 1000);

  let where: Prisma.BookingWhereInput;
  let viewer: CalendarViewer;
  if (user.role === "PARENT" && user.parentProfile) {
    viewer = "PARENT";
    const childIds = parseChildIds(feed.childIds);
    where = {
      parentProfileId: user.parentProfile.id,
      scheduledAt: { gte: since },
      ...(childIds ? { childId: { in: childIds } } : {}),
    };
  } else if (user.role === "COACH" && user.coachProfile) {
    viewer = "COACH";
    where = { coachProfileId: user.coachProfile.id, scheduledAt: { gte: since } };
  } else {
    return { viewer: "PARENT", sessions: [] };
  }

  const bookings = await prisma.booking.findMany({
    where,
    include: sessionInclude,
    orderBy: { scheduledAt: "asc" },
    take: FEED_MAX_EVENTS,
  });
  return { viewer, sessions: bookings.map(toCalendarSession) };
}

/** What the "Sync to my calendar" panel shows: whether a feed exists, never its link. */
export async function feedStatus(userId: string) {
  return prisma.calendarFeed.findUnique({
    where: { userId },
    select: { createdAt: true, resetAt: true, lastFetchedAt: true, childIds: true },
  });
}
