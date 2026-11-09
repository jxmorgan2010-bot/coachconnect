import { prisma } from "@/lib/prisma";
import type { Email } from "@/lib/email";
import type { TextReplacement } from "@/lib/emailSafety";

/**
 * The database side of email text replacements (src/lib/emailSafety.ts). sendEmail() loads this
 * only when something was replaced, and catches any error, so a failed write never stops an email.
 */
export async function saveEmailReplacements(email: Pick<Email, "to" | "subject">, replacements: TextReplacement[]): Promise<void> {
  await prisma.emailTextReplacement.createMany({
    data: replacements.map((r) => ({
      toEmail: email.to,
      subject: email.subject,
      part: r.part,
      categories: r.categories.join(", "),
      originalText: r.originalText,
      sentText: r.sentText,
    })),
  });
}

/** Marks one replacement reviewed. False if it doesn't exist or was already reviewed. */
export async function markEmailReplacementReviewed(id: string, adminUserId: string, now = new Date()): Promise<boolean> {
  const { count } = await prisma.emailTextReplacement.updateMany({
    where: { id, reviewedAt: null },
    data: { reviewedAt: now, reviewedById: adminUserId },
  });
  return count === 1;
}
