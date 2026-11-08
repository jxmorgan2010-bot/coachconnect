import { prisma } from "@/lib/prisma";
import { buildIcs } from "@/lib/calendar";
import { hashFeedToken, parseFeedToken } from "@/lib/calendarFeed";
import { feedSessions, takeFeedRequest } from "@/lib/calendarFeedStore";

/**
 * A private calendar feed (src/lib/calendarFeed.ts). No sign-in: calendar apps fetch it on their
 * own schedule. An unknown or reset token is a plain 404 after one indexed lookup, with nothing
 * written. Every response asks not to be indexed, cached by shared caches, or leak its address
 * as a referrer.
 */
const PRIVATE_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
} as const;

function plain(status: number, body: string, extra: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...PRIVATE_HEADERS, ...extra },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = parseFeedToken((await params).token);
  if (!token) return plain(404, "Not found.");

  const feed = await prisma.calendarFeed.findUnique({ where: { tokenHash: hashFeedToken(token) } });
  if (!feed) return plain(404, "Not found.");

  const now = new Date();
  const rate = await takeFeedRequest(feed, now);
  if (!rate.ok) {
    return plain(429, "Too many requests. Try again later.", { "Retry-After": String(rate.retryAfterSeconds) });
  }

  const result = await feedSessions(feed, now);
  if (!result) return plain(404, "Not found.");

  return new Response(buildIcs(result.sessions, { viewer: result.viewer, now, feed: true }), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="assist-coaching.ics"',
      ...PRIVATE_HEADERS,
    },
  });
}
