import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Proof that an admin opened a coach's current ID before approving it, so "A person on our team
 * has reviewed every listed coach's ID" stays true.
 *
 * When /api/admin/coaches/[id]/id-photo serves an ID, it sets a short-lived, httpOnly cookie
 * scoped to that coach's admin routes. The cookie is an HMAC over the admin, the coach and the
 * stored ID's path, so it only counts for the same admin, the same coach and that exact file: a
 * re-uploaded ID needs opening again. The path is only hashed into the signature, never sent.
 * Approving checks it inside setIdVerificationStatus (src/lib/minorConsent.ts).
 */

export const ID_REVIEW_WINDOW_SECONDS = 2 * 60 * 60;

function signingKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set, so ID review can't be recorded.");
  // A key of its own, derived from the auth secret, so these tokens can't stand in for anything else.
  return createHmac("sha256", secret).update("coachconnect:id-review:v1").digest();
}

type ReviewSubject = { adminUserId: string; coachProfileId: string; idPhotoPath: string };

function signature({ adminUserId, coachProfileId, idPhotoPath }: ReviewSubject, expiresAt: number): string {
  const pathHash = createHash("sha256").update(idPhotoPath).digest("hex");
  return createHmac("sha256", signingKey()).update(`${adminUserId}\n${coachProfileId}\n${pathHash}\n${expiresAt}`).digest("base64url");
}

export function idReviewCookieName(coachProfileId: string): string {
  return `cc_id_reviewed_${coachProfileId}`;
}

/** Sent only to this coach's admin routes (the ID photo and the approve route). */
export function idReviewCookiePath(coachProfileId: string): string {
  return `/api/admin/coaches/${coachProfileId}`;
}

export function issueIdReviewToken(subject: ReviewSubject, now: Date = new Date()): string {
  const expiresAt = Math.floor(now.getTime() / 1000) + ID_REVIEW_WINDOW_SECONDS;
  return `${expiresAt}.${signature(subject, expiresAt)}`;
}

export function isIdReviewTokenValid(token: string | undefined, subject: ReviewSubject, now: Date = new Date()): boolean {
  if (!token) return false;
  const match = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (expiresAt <= Math.floor(now.getTime() / 1000)) return false;
  const expected = Buffer.from(signature(subject, expiresAt));
  const given = Buffer.from(match[2]);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
