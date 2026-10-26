/**
 * Product switches that aren't safety or legal gates (those live in flags.ts).
 * Plain constants, so turning one back on is a one-line change and a deploy.
 */

/**
 * Coach bio video uploads. Off during the beta to keep file storage well inside Vercel Blob's
 * Hobby limits (1 GB stored, 10 GB downloaded, 2,000 uploads a month); three clips can be
 * 100+ MB per coach. While off, the onboarding step is hidden and the upload routes refuse new
 * clips. Clips already saved on a profile are left alone and still show. Set to true to turn
 * uploads back on.
 */
export const BIO_VIDEO_UPLOADS_ENABLED = false;

export const BIO_VIDEO_PAUSED_MESSAGE = "Bio video uploads are paused during the beta.";

/**
 * Experienced coaches: any adult 18 or older, verified with a government photo ID instead of a
 * school ID. While off, signup only offers the student-athlete path (the register route refuses
 * the other), and the coach-type badges, search filter, self-reported experience section and
 * the copy that mentions experienced coaches are hidden, so the site reads as student-athletes
 * only. Experienced coaches who signed up while it was on stay listed and can finish onboarding.
 */
export const EXPERIENCED_COACHES_ENABLED = false;
