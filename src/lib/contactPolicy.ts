import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkFields } from "@/lib/moderation";
import { CONTACT_RULE_TEXT, ACCOUNT_SUSPENDED_MESSAGE } from "@/lib/contactRule";

export { CONTACT_RULE_TEXT, ACCOUNT_SUSPENDED_MESSAGE };

export const SUSPENSION_REASON_CONTACT = "contact_sharing";
const SUSPEND_AT_STRIKE = 2;
// A double-tapped Send shouldn't turn one warning into a suspension.
const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
const MAX_STORED_TEXT = 2000;

export type ModerationContext =
  | "MESSAGE"
  | "BIO"
  | "PROFILE"
  | "PROGRESS_NOTE"
  | "TRAINING_PLAN"
  | "REVIEW"
  | "BOOKING_LOCATION"
  | "RECOMMENDATION"
  | "REPORT"
  | "SUPPORT"
  | "DISPUTE";

/** Channels only admins read (plus the author). Text is let through and logged, never struck. */
const ADMIN_ONLY_CONTEXTS: ModerationContext[] = ["REPORT", "SUPPORT", "DISPUTE"];

function blockedMessage(context: ModerationContext, strike: number | null) {
  const verb = context === "MESSAGE" ? "sent" : "saved";
  if (strike === null) {
    return `This wasn't ${verb}. Please remove contact details or mentions of other apps and try again. ${CONTACT_RULE_TEXT}`;
  }
  if (strike >= SUSPEND_AT_STRIKE) {
    return `This wasn't ${verb}, and your account is now suspended because it looked like contact details or a way to move off CoachConnect a second time. If you think this is a mistake, use Need help to contact support.`;
  }
  return `This wasn't ${verb}. It looks like it includes contact details or a way to move off CoachConnect. Keep conversations and payments here — this is your first warning, and a second time will suspend your account.`;
}

/** 403 for any signed-in action a suspended account may not take (messaging, booking). */
export async function rejectIfSuspended(userId: string): Promise<NextResponse | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isSuspended: true } });
  if (user?.isSuspended) {
    return NextResponse.json({ error: ACCOUNT_SUSPENDED_MESSAGE, code: "ACCOUNT_SUSPENDED" }, { status: 403 });
  }
  return null;
}

/**
 * Check user-entered text before saving it. Returns a response to send back if the text
 * must not be saved, or null if the caller should carry on.
 *
 * - Admin-only channels (report/support/dispute): never blocked; a match is logged.
 * - No account (public recommendation form): blocked and logged, no strike.
 * - Everyone else: blocked, logged, strike recorded; second strike suspends the account.
 */
export async function enforceContactPolicy({
  userId,
  context,
  fields,
}: {
  userId: string | null;
  context: ModerationContext;
  fields: (string | null | undefined)[];
}): Promise<NextResponse | null> {
  const result = checkFields(fields);
  if (!result.flagged) return null;

  const blockedText = fields.filter(Boolean).join("\n---\n").slice(0, MAX_STORED_TEXT);

  if (ADMIN_ONLY_CONTEXTS.includes(context)) {
    await prisma.flaggedAttempt.create({ data: { userId, context, blockedText, blocked: false } });
    return null;
  }

  if (!userId) {
    await prisma.flaggedAttempt.create({ data: { userId: null, context, blockedText, blocked: true } });
    return NextResponse.json({ error: blockedMessage(context, null), code: "CONTACT_BLOCKED" }, { status: 422 });
  }

  const strike = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { strikeCount: true } });

    const recentDuplicate = await tx.flaggedAttempt.findFirst({
      where: {
        userId,
        blocked: true,
        blockedText,
        clearedAt: null,
        createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
      },
    });
    if (recentDuplicate) return user.strikeCount;

    const next = user.strikeCount + 1;
    await tx.flaggedAttempt.create({ data: { userId, context, blockedText, blocked: true, strikeNumber: next } });
    await tx.user.update({
      where: { id: userId },
      data:
        next >= SUSPEND_AT_STRIKE
          ? { strikeCount: next, isSuspended: true, suspendedAt: new Date(), suspensionReason: SUSPENSION_REASON_CONTACT }
          : { strikeCount: next },
    });
    return next;
  });

  return NextResponse.json(
    {
      error: blockedMessage(context, strike),
      code: strike >= SUSPEND_AT_STRIKE ? "ACCOUNT_SUSPENDED" : "CONTACT_BLOCKED",
      strike,
    },
    { status: strike >= SUSPEND_AT_STRIKE ? 403 : 422 },
  );
}
