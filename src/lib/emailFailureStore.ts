import { prisma } from "@/lib/prisma";
import type { Email } from "@/lib/email";

/**
 * Emails that didn't go out at all, for "Email problems" on /admin/jobs. sendEmail() loads this
 * only when a send fails, and catches any error, so a failed write never affects anything else.
 *
 * Kept: recipient, subject (as it would have been sent), a short reason, and the retry recipe
 * (ids and small values only). Never the API key, the body or any link: some links carry one-time
 * tokens, so a retry rebuilds the email instead (src/lib/emailRetry.ts).
 */
export async function saveEmailFailure(email: Pick<Email, "to" | "subject" | "retry">, reason: string): Promise<void> {
  await prisma.emailSendFailure.create({
    data: {
      toEmail: email.to,
      subject: email.subject,
      reason: reason.slice(0, 200),
      retryKind: email.retry?.kind ?? null,
      retryRef: email.retry?.ref ?? null,
      retryParams: email.retry?.params ? JSON.stringify(email.retry.params) : null,
    },
  });
}

/** An admin marked it handled. False if it doesn't exist or is already resolved. */
export async function markEmailFailureReviewed(id: string, adminUserId: string, now = new Date()): Promise<boolean> {
  const { count } = await prisma.emailSendFailure.updateMany({
    where: { id, resolvedAt: null },
    data: { resolvedAt: now, resolvedById: adminUserId, resolution: "REVIEWED" },
  });
  return count === 1;
}
