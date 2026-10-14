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
