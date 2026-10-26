import { test } from "node:test";
import assert from "node:assert/strict";
import { ID_REVIEW_WINDOW_SECONDS, idReviewCookiePath, isIdReviewTokenValid, issueIdReviewToken } from "./idReview";

// The key is read when a token is signed, so setting it here is early enough.
process.env.NEXTAUTH_SECRET ??= "test-only-secret";

const subject = { adminUserId: "admin_1", coachProfileId: "coach_1", idPhotoPath: "id-verifications/coach_1/id-abc.png" };
const now = new Date("2026-10-25T18:00:00Z");

test("the admin who opened the ID can approve that same ID", () => {
  assert.equal(isIdReviewTokenValid(issueIdReviewToken(subject, now), subject, now), true);
});

test("it doesn't count for another admin, another coach, or a re-uploaded ID", () => {
  const token = issueIdReviewToken(subject, now);
  assert.equal(isIdReviewTokenValid(token, { ...subject, adminUserId: "admin_2" }, now), false);
  assert.equal(isIdReviewTokenValid(token, { ...subject, coachProfileId: "coach_2" }, now), false);
  assert.equal(isIdReviewTokenValid(token, { ...subject, idPhotoPath: "id-verifications/coach_1/id-new.png" }, now), false);
});

test("it expires after the review window", () => {
  const token = issueIdReviewToken(subject, now);
  const justBefore = new Date(now.getTime() + (ID_REVIEW_WINDOW_SECONDS - 1) * 1000);
  const atExpiry = new Date(now.getTime() + ID_REVIEW_WINDOW_SECONDS * 1000);
  assert.equal(isIdReviewTokenValid(token, subject, justBefore), true);
  assert.equal(isIdReviewTokenValid(token, subject, atExpiry), false);
});

test("a missing, malformed or edited token never counts", () => {
  const token = issueIdReviewToken(subject, now);
  const [expiresAt, sig] = token.split(".");
  assert.equal(isIdReviewTokenValid(undefined, subject, now), false);
  assert.equal(isIdReviewTokenValid("", subject, now), false);
  assert.equal(isIdReviewTokenValid("garbage", subject, now), false);
  // Pushing the expiry out invalidates the signature.
  assert.equal(isIdReviewTokenValid(`${Number(expiresAt) + 86400}.${sig}`, subject, now), false);
  const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
  assert.equal(isIdReviewTokenValid(`${expiresAt}.${flipped}`, subject, now), false);
});

test("the token never contains the ID's storage path", () => {
  assert.equal(issueIdReviewToken(subject, now).includes("id-verifications"), false);
  assert.equal(idReviewCookiePath("coach_1"), "/api/admin/coaches/coach_1");
});
