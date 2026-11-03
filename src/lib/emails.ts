import type { Email } from "@/lib/email";
import { firstName, safeText } from "@/lib/email";
import { siteLink } from "@/lib/siteUrl";
import { formatCents, AUTO_RELEASE_GRACE_HOURS } from "@/lib/money";
import { formatPacificDateTime } from "@/lib/sessionTiming";
import { freeCancelPolicyText, parentCancelOutcome, type ParentCancelOutcome } from "@/lib/cancellation";
import { lengthLabel } from "@/lib/sessionLengths";
import { SPORT_LABELS } from "@/lib/sports";
import type { Sport } from "@/generated/prisma/client";

/**
 * Every email the app sends, as pure functions (src/lib/email.ts renders and sends them).
 *
 * Rules: no contact details, ID details, message text, report text or admin notes. Anything a
 * person typed (names, the session location) goes through safeText() / firstName(), which fall
 * back to a neutral phrase if the contact-info filter would block it.
 */

const PLACE_FALLBACK = "the place in your booking";
const BOOKINGS = "/dashboard/bookings";

// ---------------------------------------------------------------- account

export const RESET_LINK_TTL_TEXT = "1 hour";

export function passwordResetEmail(p: { to: string; name: string; link: string }): Email {
  return {
    to: p.to,
    subject: "Reset your password",
    paragraphs: [
      `Hi ${firstName(p.name)},`,
      "Someone asked to reset the password for your Assist Coaching account. If that was you, choose a new password with the button below.",
      "If it wasn't you, you can ignore this email. Your password stays the same.",
    ],
    button: { label: "Choose a new password", url: p.link },
    footnote: `This link works once and expires in ${RESET_LINK_TTL_TEXT}.`,
  };
}

export function passwordChangedEmail(p: { to: string; name: string }): Email {
  return {
    to: p.to,
    subject: "Your password was changed",
    paragraphs: [
      `Hi ${firstName(p.name)},`,
      "The password for your Assist Coaching account was just changed, and every device that was signed in has been signed out.",
      "If you didn't do this, reset your password now and use Need help in the app to let us know.",
    ],
    button: { label: "Log in", url: siteLink("/login") },
  };
}

// ---------------------------------------------------------------- bookings

export type BookingFacts = {
  coachName: string;
  parentName: string;
  childFirstName: string | null;
  sport: Sport;
  scheduledAt: Date;
  durationMinutes: number;
  locationText: string;
  priceCents: number;
  discountCents: number;
  /** Set for a session drawn from a package: sessions still left after this one. */
  packageSessionsLeft: number | null;
  /** A card hold was placed (not a package, not fully covered by credit). */
  hasCardHold: boolean;
  /** The card was saved at booking and the hold is placed on this date (src/lib/holdTiming.ts). */
  cardHoldDueAt: Date | null;
};

const sportName = (s: Sport) => SPORT_LABELS[s] ?? "sports";
const childLabel = (b: BookingFacts) => safeText(b.childFirstName, "your child");

/**
 * The cancellation policy, as it applies to this booking, in the booking form's words
 * (src/app/coaches/[id]/book/CancellationPolicyNote.tsx). A session booked after its free-cancel
 * deadline (today, or tomorrow after midnight) says so instead of naming a deadline in the past.
 */
export function cancellationPolicyLines(b: Pick<BookingFacts, "scheduledAt" | "packageSessionsLeft">, now = new Date()): string[] {
  const lateCost = b.packageSessionsLeft !== null ? "the session counts as used from your package" : "you're charged the full price";
  const coachLine = "If the coach cancels or doesn't show, you're never charged.";
  if (parentCancelOutcome(b.scheduledAt, now) === "LATE") {
    return [`This session is past the free-cancellation deadline. If you cancel it, ${lateCost}.`, coachLine];
  }
  return [`${freeCancelPolicyText(b.scheduledAt)}. After that, ${lateCost}.`, coachLine];
}

function paymentLine(b: BookingFacts): string {
  const charge = b.priceCents - b.discountCents;
  if (b.packageSessionsLeft !== null) {
    const left = b.packageSessionsLeft === 1 ? "1 session" : `${b.packageSessionsLeft} sessions`;
    return `This session is from your package, so there's no charge today. You have ${left} left.`;
  }
  const credit = b.discountCents > 0 ? ` (${formatCents(b.discountCents)} of credit applied)` : "";
  const whenCharged = `It's charged when you mark the session complete, or ${AUTO_RELEASE_GRACE_HOURS} hours after the session ends if you haven't marked it or reported a problem.`;
  if (b.cardHoldDueAt) {
    return `We've saved your card. On ${formatPacificDateTime(b.cardHoldDueAt)}, 2 days before the session, we'll place a hold of ${formatCents(charge)} on it${credit}. ${whenCharged}`;
  }
  if (!b.hasCardHold) return `Your credit covers this session${credit}, so your card isn't charged.`;
  return `We've placed a hold of ${formatCents(charge)} on your card${credit}. ${whenCharged}`;
}

export function bookingConfirmedParentEmail(to: string, b: BookingFacts, now = new Date()): Email {
  return {
    to,
    subject: `Session booked with ${firstName(b.coachName)}`,
    paragraphs: [
      `${childLabel(b)}'s ${sportName(b.sport)} session with ${safeText(b.coachName, "your coach")} is booked for ${formatPacificDateTime(b.scheduledAt)} (${lengthLabel(b.durationMinutes)}).`,
      `Where: ${safeText(b.locationText, PLACE_FALLBACK)}`,
      paymentLine(b),
      ...cancellationPolicyLines(b, now),
    ],
    button: { label: "See your bookings", url: siteLink(BOOKINGS) },
  };
}

export function bookingNewCoachEmail(to: string, b: BookingFacts): Email {
  return {
    to,
    subject: `New booking: ${formatPacificDateTime(b.scheduledAt)}`,
    paragraphs: [
      `${firstName(b.parentName)}'s family booked a ${lengthLabel(b.durationMinutes)} ${sportName(b.sport)} session with you for ${childLabel(b)} on ${formatPacificDateTime(b.scheduledAt)}.`,
      `Where: ${safeText(b.locationText, PLACE_FALLBACK)}`,
      "Plan the details in Assist Coaching messages.",
    ],
    button: { label: "See your sessions", url: siteLink("/dashboard") },
  };
}

export type ParentCancelFacts = BookingFacts & {
  outcome: ParentCancelOutcome;
  /** Whether Stripe confirmed the release or charge. False means it's being retried by our team. */
  stripeOk: boolean;
};

/** Cancelled with no hold to release: none was needed, or it wasn't placed yet. */
function notChargedLine(b: BookingFacts): string {
  const noHoldYet = b.cardHoldDueAt ? " No hold had been placed on your card yet." : "";
  return b.discountCents > 0
    ? `You weren't charged, and the ${formatCents(b.discountCents)} of credit you used is back in your account.${noHoldYet}`
    : `You weren't charged.${noHoldYet}`;
}

/** Exactly what a parent's cancellation did to their money. */
export function parentCancelMoneyLine(c: ParentCancelFacts): string {
  const charge = c.priceCents - c.discountCents;
  const isPackage = c.packageSessionsLeft !== null;
  if (c.outcome === "FREE") {
    if (isPackage) return "You weren't charged, and the session has gone back into your package.";
    if (c.hasCardHold) {
      return c.stripeOk
        ? "You weren't charged. The hold on your card has been released."
        : "You won't be charged. We're releasing the hold on your card.";
    }
    return notChargedLine(c);
  }
  if (isPackage) return "It was after the free-cancellation deadline, so the session counts as used from your package.";
  if (c.hasCardHold || c.cardHoldDueAt) {
    return c.stripeOk
      ? `It was after the free-cancellation deadline, so your card was charged the full price of ${formatCents(charge)}.`
      : `It was after the free-cancellation deadline, so the full price of ${formatCents(charge)} will be charged to your card.`;
  }
  return `It was after the free-cancellation deadline, so the ${formatCents(c.discountCents)} of credit you used stays spent. Your card wasn't charged.`;
}

export function parentCancelledParentEmail(to: string, c: ParentCancelFacts): Email {
  return {
    to,
    subject: "Your session is cancelled",
    paragraphs: [
      `You cancelled ${childLabel(c)}'s session with ${safeText(c.coachName, "your coach")} on ${formatPacificDateTime(c.scheduledAt)}.`,
      parentCancelMoneyLine(c),
    ],
    button: { label: "See your bookings", url: siteLink(BOOKINGS) },
  };
}

export function parentCancelledCoachEmail(to: string, c: ParentCancelFacts): Email {
  const parent = safeText(c.parentName, "The family");
  const child = c.childFirstName ? `${safeText(c.childFirstName, "their child")}'s` : "their";
  const when = formatPacificDateTime(c.scheduledAt);
  return {
    to,
    subject: "Session cancelled by the family",
    paragraphs: [
      c.outcome === "FREE"
        ? `${parent} cancelled ${child} session on ${when}. The time is open again.`
        : `${parent} cancelled ${child} session on ${when} after the free-cancellation deadline. You're paid for this session as if it happened, and the time is open again.`,
    ],
    button: { label: "See your sessions", url: siteLink("/dashboard") },
  };
}

/** Coach cancels: the parent is never charged. */
export function coachCancelledParentEmail(to: string, c: BookingFacts & { stripeOk: boolean }): Email {
  const money =
    c.packageSessionsLeft !== null
      ? "You weren't charged, and the session has gone back into your package."
      : c.hasCardHold
        ? c.stripeOk
          ? "You weren't charged. The hold on your card has been released."
          : "You won't be charged. We're releasing the hold on your card."
        : notChargedLine(c);
  return {
    to,
    subject: "Your coach cancelled a session",
    paragraphs: [`${safeText(c.coachName, "Your coach")} cancelled your session on ${formatPacificDateTime(c.scheduledAt)}.`, money],
    button: { label: "Book another time", url: siteLink(BOOKINGS) },
  };
}

/** The platform cancelled (a minor coach's guardian withdrew consent). Never charged. */
export function platformCancelledParentEmail(p: { to: string; coachName: string; scheduledAt: Date; moneyLine: string }): Email {
  return {
    to: p.to,
    subject: "Session cancelled",
    paragraphs: [
      `Your session with ${safeText(p.coachName, "your coach")} on ${formatPacificDateTime(p.scheduledAt)} has been cancelled because the coach is no longer available. ${p.moneyLine}`,
    ],
    button: { label: "See your bookings", url: siteLink(BOOKINGS) },
  };
}

// ---------------------------------------------------------------- card holds (src/lib/cardHolds.ts)

export type HoldFacts = {
  coachName: string;
  childFirstName: string | null;
  scheduledAt: Date;
  amountCents: number;
};

/** The hold 2 days before the session failed. One email; the update page places the hold. */
export function holdFailedParentEmail(p: HoldFacts & { to: string; bookingId: string; fixBy: Date; needsAuthentication: boolean }): Email {
  return {
    to: p.to,
    subject: "Action needed: update your card",
    paragraphs: [
      `We couldn't place the ${formatCents(p.amountCents)} hold for ${safeText(p.childFirstName, "your child")}'s session with ${safeText(p.coachName, "your coach")} on ${formatPacificDateTime(p.scheduledAt)}.`,
      p.needsAuthentication
        ? "Your bank wants you to confirm the card before it can be used."
        : "Your card was declined.",
      `Update your card by ${formatPacificDateTime(p.fixBy)}, or the session will be cancelled. A hold isn't a charge: you're charged after the session.`,
    ],
    button: { label: "Update card", url: siteLink(`/dashboard/bookings/${p.bookingId}/card`) },
  };
}

/** Still no hold 12 hours before: the platform cancelled. Never charged. */
export function holdNotFixedParentEmail(p: HoldFacts & { to: string; creditReturnedCents: number }): Email {
  const credit = p.creditReturnedCents > 0 ? ` The ${formatCents(p.creditReturnedCents)} of credit you used is back in your account.` : "";
  return {
    to: p.to,
    subject: "Session cancelled: card not updated",
    paragraphs: [
      `We couldn't place a hold on your card for ${safeText(p.childFirstName, "your child")}'s session with ${safeText(p.coachName, "your coach")} on ${formatPacificDateTime(p.scheduledAt)}, and the card wasn't updated in time, so the session has been cancelled.`,
      `You weren't charged.${credit} You can book another time whenever you're ready.`,
    ],
    button: { label: "See your bookings", url: siteLink(BOOKINGS) },
  };
}

export function holdNotFixedCoachEmail(p: { to: string; scheduledAt: Date }): Email {
  return {
    to: p.to,
    subject: `Session cancelled: ${formatPacificDateTime(p.scheduledAt)}`,
    paragraphs: [
      `Your session on ${formatPacificDateTime(p.scheduledAt)} was cancelled because the family's payment couldn't be confirmed. The time is open again.`,
    ],
    button: { label: "See your sessions", url: siteLink("/dashboard") },
  };
}

export function noShowParentEmail(p: { to: string; coachName: string }): Email {
  return {
    to: p.to,
    subject: "We're on it: no-show reported",
    paragraphs: [
      `Thanks for letting us know your session with ${safeText(p.coachName, "your coach")} didn't happen. Your card was never charged and our team is reviewing the case.`,
    ],
    button: { label: "See your bookings", url: siteLink(BOOKINGS) },
  };
}

export function noShowCoachEmail(p: { to: string; scheduledAt: Date }): Email {
  return {
    to: p.to,
    subject: "Session flagged as a no-show",
    paragraphs: [
      `The parent for your ${formatPacificDateTime(p.scheduledAt)} session reported that it didn't happen. This has been flagged for admin review.`,
    ],
    button: { label: "See your sessions", url: siteLink("/dashboard") },
  };
}

export function autoReleasedParentEmail(p: { to: string; coachName: string }): Email {
  return {
    to: p.to,
    subject: "Session auto-completed",
    paragraphs: [
      `We didn't hear back within ${AUTO_RELEASE_GRACE_HOURS} hours of your session with ${safeText(p.coachName, "your coach")}, so it's been marked complete and payment released. If that's not right, use Need help in the app.`,
    ],
    button: { label: "See your bookings", url: siteLink(BOOKINGS) },
  };
}

export function autoReleasedCoachEmail(p: { to: string; scheduledAt: Date }): Email {
  return {
    to: p.to,
    subject: "Payment released",
    paragraphs: [
      `Your session on ${formatPacificDateTime(p.scheduledAt)} was auto-completed after ${AUTO_RELEASE_GRACE_HOURS} hours with no response from the parent, and payment has been released.`,
    ],
    button: { label: "See your sessions", url: siteLink("/dashboard") },
  };
}

export function reminderEmail(p: {
  to: string;
  audience: "PARENT" | "COACH";
  kind: "TOMORROW" | "SOON";
  coachName: string;
  parentName: string;
  childFirstName: string | null;
  scheduledAt: Date;
  locationText: string;
}): Email {
  const when = formatPacificDateTime(p.scheduledAt);
  const where = safeText(p.locationText, PLACE_FALLBACK);
  const withWhom =
    p.audience === "PARENT" ? safeText(p.coachName, "your coach") : `${safeText(p.parentName, "the family")}'s family`;
  const line =
    p.kind === "TOMORROW"
      ? p.audience === "PARENT"
        ? `Your session with ${withWhom} for ${safeText(p.childFirstName, "your child")} is scheduled for ${when}.`
        : `Your session with ${withWhom} is scheduled for ${when}.`
      : `Your session with ${withWhom} starts at ${when} at ${where}.`;
  return {
    to: p.to,
    subject: p.kind === "TOMORROW" ? "Session reminder: tomorrow" : "Session reminder: starting soon",
    paragraphs: [line],
    button: { label: p.audience === "PARENT" ? "See your bookings" : "See your sessions", url: siteLink(p.audience === "PARENT" ? BOOKINGS : "/dashboard") },
  };
}

export type RefundFacts =
  | { kind: "REFUND"; amountCents: number; coachName: string; scheduledAt: Date }
  | { kind: "LATE_CANCEL_WAIVER"; amountCents: number; sessionsReturned: number; creditReturnedCents: number; coachName: string; scheduledAt: Date }
  | { kind: "PACKAGE_UNUSED"; amountCents: number; sessions: number; coachName: string };

const STATEMENT_NOTE = "Card refunds usually show on your statement within 5 to 10 business days.";

export function refundIssuedEmail(to: string, r: RefundFacts): Email {
  const coach = safeText(r.coachName, "your coach");
  let lines: string[];
  if (r.kind === "REFUND") {
    lines = [`We've refunded ${formatCents(r.amountCents)} to your card for your session with ${coach} on ${formatPacificDateTime(r.scheduledAt)}.`, STATEMENT_NOTE];
  } else if (r.kind === "PACKAGE_UNUSED") {
    const n = r.sessions === 1 ? "1 unused session" : `${r.sessions} unused sessions`;
    lines = [`We've refunded ${formatCents(r.amountCents)} to your card for ${n} in your package with ${coach}. Those sessions can no longer be booked.`, STATEMENT_NOTE];
  } else {
    const head = `We've waived the late-cancellation charge for your session with ${coach} on ${formatPacificDateTime(r.scheduledAt)}.`;
    const parts: string[] = [];
    if (r.sessionsReturned > 0) parts.push("The session is back in your package.");
    if (r.amountCents > 0) parts.push(`${formatCents(r.amountCents)} has been refunded to your card.`);
    if (r.creditReturnedCents > 0) parts.push(`The ${formatCents(r.creditReturnedCents)} of credit you used is back in your account.`);
    if (!parts.length) parts.push("You won't be charged for it.");
    lines = [head, parts.join(" "), ...(r.amountCents > 0 ? [STATEMENT_NOTE] : [])];
  }
  return { to, subject: "Refund issued", paragraphs: lines, button: { label: "See your bookings", url: siteLink(BOOKINGS) } };
}

// ---------------------------------------------------------------- messages

export function newMessageEmail(p: { to: string; senderName: string; threadId: string }): Email {
  const from = firstName(p.senderName);
  return {
    to: p.to,
    subject: `New message from ${from}`,
    paragraphs: [`You have a new message from ${from}.`],
    button: { label: "Read it in Assist Coaching", url: siteLink(`/messages/${p.threadId}`) },
    footnote: "You'll get at most one of these an hour for each conversation. You can turn message emails off in your settings.",
  };
}

// ---------------------------------------------------------------- minor-coach consent

export function consentRequestEmail(p: { to: string; guardianName: string; coachName: string; link: string; ttlDays: number }): Email {
  return {
    to: p.to,
    subject: `${firstName(p.coachName)} needs your consent to coach on Assist Coaching`,
    paragraphs: [
      `Hi ${safeText(p.guardianName, "there")},`,
      `${safeText(p.coachName, "Your teen")} has applied to coach on Assist Coaching. Because they're under 18, they need their parent or legal guardian's consent. Please read and sign the form.`,
    ],
    button: { label: "Read and sign", url: p.link },
    footnote: `The link works once and expires in ${p.ttlDays} days.`,
  };
}

export function consentRecordedEmail(p: { to: string; signerName: string; coachName: string; revokeLink: string }): Email {
  return {
    to: p.to,
    subject: "Your consent is recorded — keep this email",
    paragraphs: [
      `Thanks, ${safeText(p.signerName, "and welcome")}. Your consent for ${safeText(p.coachName, "your teen")} to coach on Assist Coaching is recorded.`,
      "You can withdraw it at any time with the link below, which doesn't expire.",
    ],
    button: { label: "Withdraw consent", url: p.revokeLink },
  };
}

export function consentWithdrawnGuardianEmail(p: { to: string; coachName: string; cancelledCount: number }): Email {
  return {
    to: p.to,
    subject: "Consent withdrawn",
    paragraphs: [
      `You've withdrawn consent for ${safeText(p.coachName, "your teen")} to coach on Assist Coaching. Their profile is hidden from families and ${p.cancelledCount} upcoming session(s) were cancelled.`,
    ],
  };
}

export function consentWithdrawnCoachEmail(p: { to: string }): Email {
  return {
    to: p.to,
    subject: "Your coach profile is paused",
    paragraphs: [
      "Your parent or guardian withdrew their consent, so your profile is hidden from families and your upcoming sessions were cancelled. If they change their mind, you can send them a new consent request from your onboarding page.",
    ],
    button: { label: "Open onboarding", url: siteLink("/onboarding/coach") },
  };
}

// ---------------------------------------------------------------- admin alerts

export function coachAwaitingReviewEmail(p: { to: string; coachName: string }): Email {
  return {
    to: p.to,
    subject: "A coach is waiting for review",
    paragraphs: [`${safeText(p.coachName, "A coach")} finished their onboarding steps and is waiting for review.`],
    button: { label: "Open the admin page", url: siteLink("/admin") },
  };
}

/** A scheduled job left a booking for an admin (src/lib/cardHolds.ts, src/lib/autoRelease.ts). */
export function bookingNeedsAdminEmail(p: { to: string; flag: "HOLD_NOT_FIXED" | "CHARGE_FAILED" }): Email {
  return {
    to: p.to,
    subject: p.flag === "HOLD_NOT_FIXED" ? "A session was cancelled: card not fixed" : "An auto-release charge failed",
    paragraphs: [
      p.flag === "HOLD_NOT_FIXED"
        ? "A session was cancelled because its card hold failed and the parent didn't update the card in time. No one was charged."
        : "A session's payment couldn't be charged when it was auto-completed. It hasn't been completed and won't be retried until you clear the flag.",
      "The booking is listed under Needs attention on the Scheduled jobs page.",
    ],
    button: { label: "Open Scheduled jobs", url: siteLink("/admin/jobs") },
  };
}

const REPORT_TARGET_LABEL ={ COACH_PROFILE: "a coach profile", PARENT_PROFILE: "a parent", MESSAGE: "a conversation" } as const;

export function newReportEmail(p: { to: string; targetType: keyof typeof REPORT_TARGET_LABEL }): Email {
  return {
    to: p.to,
    subject: "New report",
    paragraphs: [`Someone reported ${REPORT_TARGET_LABEL[p.targetType]}. The details are on the reports page.`],
    button: { label: "Open reports", url: siteLink("/admin/reports") },
  };
}

export function refundRequestEmail(p: { to: string; kind: "PACKAGE_UNUSED" | "PROBLEM_REPORT" | "NO_SHOW" }): Email {
  if (p.kind === "PACKAGE_UNUSED") {
    return {
      to: p.to,
      subject: "New package refund request",
      paragraphs: [
        "A parent asked for a refund of their package's unused sessions.",
        "The request is on the reports page. The refund itself is done from Refunds.",
      ],
      button: { label: "Open reports", url: siteLink("/admin/reports") },
    };
  }
  return {
    to: p.to,
    subject: "New problem report",
    paragraphs: [
      p.kind === "NO_SHOW"
        ? "A parent reported that a coach didn't show up for a session."
        : "A parent reported a problem with a session.",
      "The details are on the cases page.",
    ],
    button: { label: "Open cases", url: siteLink("/admin/disputes") },
  };
}
