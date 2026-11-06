import { createHash, timingSafeEqual } from "node:crypto";

/**
 * The scheduler (cron-job.org, or Vercel Cron on a paid plan) calls /api/jobs/* with
 * `Authorization: Bearer <CRON_SECRET>`, the header Vercel Cron sends. With CRON_SECRET unset or
 * too short, every request is refused, so a deployment without it (e.g. a preview) never runs jobs.
 */
export const MIN_CRON_SECRET_LENGTH = 32;

export function isCronRequestAuthorized(authorization: string | null, secret: string | undefined = process.env.CRON_SECRET): boolean {
  if (!secret || secret.length < MIN_CRON_SECRET_LENGTH || !authorization) return false;
  // Hashing first makes both sides the same length, so the comparison is constant-time.
  const given = createHash("sha256").update(authorization).digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(given, expected);
}
