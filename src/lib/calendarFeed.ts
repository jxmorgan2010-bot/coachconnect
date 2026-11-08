import { createHash, randomBytes } from "node:crypto";
import { COACH_TIMEZONE } from "@/lib/availability";

/**
 * Private calendar feeds: a link a parent or coach pastes into their calendar app so sessions
 * show up there on their own. One feed per user.
 *
 * - The link carries 32 random bytes. Only the SHA-256 hash is stored, so the link is shown once
 *   (right after it's made or reset) and can't be shown again. Resetting replaces the hash, which
 *   stops the old link on its next request.
 * - The link works without signing in: calendar apps can't sign in. Anyone with the link sees the
 *   same entries the user does, which is why entries carry so little (src/lib/calendar.ts).
 * - Rate limited per feed, counted in the database (Vercel functions share no memory). Calendar
 *   apps poll every 15 minutes to a day, so the limit only stops a runaway client.
 * - Covers the last FEED_PAST_DAYS days and everything upcoming. Cancelled sessions stay in,
 *   marked cancelled, so a phone that already has the event shows it was called off.
 */

export const FEED_PAST_DAYS = 30;
export const FEED_MAX_EVENTS = 500;
export const FEED_RATE_LIMIT = 60;
export const FEED_RATE_WINDOW_MS = 60 * 60 * 1000;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function hashFeedToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newFeedToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashFeedToken(token) };
}

/** The token from the URL segment ("<token>.ics" or "<token>"), or null if it can't be one. */
export function parseFeedToken(segment: string): string | null {
  const token = segment.replace(/\.ics$/i, "");
  return TOKEN_PATTERN.test(token) ? token : null;
}

/** The path of a feed link. The browser adds its own origin. */
export function feedPath(token: string): string {
  return `/api/calendar/feed/${token}.ics`;
}

/** Child ids stored on the feed, or null for "every child". Bad JSON reads as every child. */
export function parseChildIds(value: string | null): string[] | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((v) => typeof v === "string") ? parsed : null;
  } catch {
    return null;
  }
}

/** "made Nov 8" or "reset Nov 8", in Pacific time. */
export function feedMadeLabel(feed: { createdAt: Date; resetAt: Date | null }): string {
  const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: COACH_TIMEZONE });
  return feed.resetAt ? `reset ${day(feed.resetAt)}` : `made ${day(feed.createdAt)}`;
}
