import { prisma } from "@/lib/prisma";
import { cancelPaymentIntent, refundCapturedPayment } from "@/lib/payment";
import { formatCents } from "@/lib/money";
import { bookingChargeCents } from "@/lib/cancellation";
import { paidPerSessionCents, sessionsLeft } from "@/lib/bundles";

/**
 * Admin-only money returns. Once a session is charged, only an admin can give money back:
 * a full or partial refund (from a dispute or a parent's problem report), a waived
 * late-cancellation charge, or a package's unused sessions. Every one writes a Refund row
 * saying who did it, how much and why.
 *
 * Stripe is called before the database is written: if Stripe refuses, nothing is recorded
 * and the admin sees the error; a refund that went through is always in the ledger.
 */

export class RefundError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function requireReason(reason: string | null | undefined): string {
  const trimmed = reason?.trim();
  if (!trimmed) throw new RefundError("Say why — the reason is kept with the refund.");
  return trimmed;
}

function requireAmount(amountCents: number, maxCents: number): number {
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > maxCents) {
    throw new RefundError(`Enter an amount between $0.01 and ${formatCents(maxCents)}.`);
  }
  return amountCents;
}

/** Money already refunded through Stripe for a booking. */
export async function refundedCentsForBooking(bookingId: string): Promise<number> {
  const agg = await prisma.refund.aggregate({ where: { bookingId }, _sum: { amountCents: true } });
  return agg._sum.amountCents ?? 0;
}

/** Money already refunded against a package's purchase (its sessions' refunds included). */
export async function refundedCentsForPackage(packageId: string): Promise<number> {
  const agg = await prisma.refund.aggregate({ where: { packageId }, _sum: { amountCents: true } });
  return agg._sum.amountCents ?? 0;
}

/** Full or partial refund of a charged session. May be repeated until it's fully refunded. */
export async function refundBooking({
  bookingId,
  amountCents,
  reason,
  adminUserId,
  now = new Date(),
}: {
  bookingId: string;
  amountCents: number;
  reason: string;
  adminUserId: string;
  now?: Date;
}) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { package: true, dispute: true } });
  if (!b) throw new RefundError("Booking not found.", 404);
  if (b.paymentStatus !== "CAPTURED" && b.paymentStatus !== "PARTIALLY_REFUNDED") {
    throw new RefundError("There's no charge on this session to refund.");
  }
  // A bundled session has no PaymentIntent of its own: its money was charged with the package.
  const intentId = b.stripePaymentIntentId ?? b.package?.stripePaymentIntentId ?? null;
  if (!intentId) {
    throw new RefundError("This session was covered by referral credit, not a card, so there's nothing to refund through Stripe.");
  }
  const why = requireReason(reason);
  const charged = bookingChargeCents(b);
  const refunded = await refundedCentsForBooking(b.id);
  const amount = requireAmount(amountCents, charged - refunded);
  if (b.package) {
    const packageLeft = b.package.totalChargedCents - (await refundedCentsForPackage(b.package.id));
    requireAmount(amount, packageLeft);
  }

  const stripeRefundId = await refundCapturedPayment(intentId, amount);
  const total = refunded + amount;
  await prisma.$transaction([
    prisma.refund.create({
      data: {
        kind: "REFUND",
        bookingId: b.id,
        packageId: b.packageId,
        disputeId: b.dispute?.id ?? null,
        amountCents: amount,
        reason: why,
        refundedById: adminUserId,
        stripeRefundId,
      },
    }),
    prisma.booking.update({
      where: { id: b.id },
      data: { paymentStatus: total >= charged ? "REFUNDED" : "PARTIALLY_REFUNDED" },
    }),
    ...(b.dispute
      ? [prisma.dispute.update({ where: { id: b.dispute.id }, data: { status: "REFUNDED", refundCents: total, resolvedAt: now } })]
      : []),
  ]);
  return { refundedCents: total, remainingCents: charged - total };
}

/**
 * Waives a late-cancellation charge (emergencies, weather): the parent ends up paying
 * nothing. Card: whatever is still charged is refunded (or a hold that was never captured
 * is released). Package: the session goes back into the package. Referral credit spent on
 * the booking goes back to the parent.
 */
export async function waiveLateCancel({
  bookingId,
  reason,
  adminUserId,
  now = new Date(),
}: {
  bookingId: string;
  reason: string;
  adminUserId: string;
  now?: Date;
}) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, include: { package: true, dispute: true, refunds: true } });
  if (!b) throw new RefundError("Booking not found.", 404);
  if (b.status !== "CANCELLED" || !b.lateCancellation) throw new RefundError("Only a late cancellation's charge can be waived.");
  if (b.refunds.some((r) => r.kind === "LATE_CANCEL_WAIVER")) throw new RefundError("This charge has already been waived.");
  const why = requireReason(reason);

  const resolveDispute = (refundCents: number) =>
    b.dispute && b.dispute.status !== "REFUNDED"
      ? [prisma.dispute.update({ where: { id: b.dispute.id }, data: { status: "REFUNDED" as const, refundCents, resolvedAt: now } })]
      : [];

  if (b.package) {
    if (b.package.sessionsCashRefunded > 0) {
      throw new RefundError("This package's unused sessions were already refunded, so the session can't go back into it. Refund the session from its case instead.");
    }
    await prisma.$transaction([
      prisma.booking.update({ where: { id: b.id }, data: { paymentStatus: "REFUNDED" } }),
      prisma.sessionPackage.update({
        where: { id: b.package.id },
        data: { sessionsUsed: { decrement: 1 }, sessionsRefunded: { increment: 1 }, status: "ACTIVE" },
      }),
      prisma.refund.create({
        data: { kind: "LATE_CANCEL_WAIVER", bookingId: b.id, packageId: b.package.id, disputeId: b.dispute?.id ?? null, amountCents: 0, sessionCount: 1, reason: why, refundedById: adminUserId },
      }),
      ...resolveDispute(0),
    ]);
    return { refundedCents: 0, sessionsReturned: 1 };
  }

  const creditBack =
    b.discountCents > 0
      ? [prisma.parentProfile.update({ where: { id: b.parentProfileId }, data: { creditCents: { increment: b.discountCents } } })]
      : [];
  const ledgerReason = b.discountCents > 0 ? `${why} (${formatCents(b.discountCents)} referral credit returned)` : why;

  // No card charge to undo: either the booking had no hold (credit covered it), or the late
  // charge never went through and the hold is still sitting there.
  if (!b.stripePaymentIntentId || b.paymentStatus === "AUTHORIZED") {
    if (b.stripePaymentIntentId) await cancelPaymentIntent(b.stripePaymentIntentId);
    await prisma.$transaction([
      prisma.booking.update({ where: { id: b.id }, data: { paymentStatus: "CANCELLED" } }),
      ...creditBack,
      prisma.refund.create({
        data: { kind: "LATE_CANCEL_WAIVER", bookingId: b.id, disputeId: b.dispute?.id ?? null, amountCents: 0, reason: ledgerReason, refundedById: adminUserId },
      }),
      ...resolveDispute(0),
    ]);
    return { refundedCents: 0, sessionsReturned: 0 };
  }

  const remaining = bookingChargeCents(b) - b.refunds.reduce((sum, r) => sum + r.amountCents, 0);
  if (remaining <= 0) throw new RefundError("This charge has already been refunded in full.");
  const stripeRefundId = await refundCapturedPayment(b.stripePaymentIntentId, remaining);
  await prisma.$transaction([
    prisma.booking.update({ where: { id: b.id }, data: { paymentStatus: "REFUNDED" } }),
    ...creditBack,
    prisma.refund.create({
      data: { kind: "LATE_CANCEL_WAIVER", bookingId: b.id, disputeId: b.dispute?.id ?? null, amountCents: remaining, reason: ledgerReason, refundedById: adminUserId, stripeRefundId },
    }),
    ...resolveDispute(remaining),
  ]);
  return { refundedCents: remaining, sessionsReturned: 0 };
}

/** What refunding a package's unused sessions would return, before the admin adjusts it. */
export async function suggestedUnusedRefund(pkg: {
  id: string;
  totalSessions: number;
  sessionsUsed: number;
  sessionsCashRefunded: number;
  pricePerSessionCents: number;
  discountPercent: number;
  totalChargedCents: number;
}) {
  const unused = sessionsLeft(pkg);
  const maxCents = pkg.totalChargedCents - (await refundedCentsForPackage(pkg.id));
  return { unused, maxCents, suggestedCents: Math.min(unused * paidPerSessionCents(pkg), maxCents) };
}

/** Refunds a package's unused sessions as money. They can't be booked afterwards. */
export async function refundUnusedPackageSessions({
  packageId,
  amountCents,
  reason,
  adminUserId,
}: {
  packageId: string;
  amountCents: number;
  reason: string;
  adminUserId: string;
}) {
  const pkg = await prisma.sessionPackage.findUnique({ where: { id: packageId } });
  if (!pkg) throw new RefundError("Package not found.", 404);
  if (!pkg.stripePaymentIntentId) throw new RefundError("This package has no card payment to refund.");
  const { unused, maxCents } = await suggestedUnusedRefund(pkg);
  if (unused <= 0) throw new RefundError("This package has no unused sessions left.");
  const why = requireReason(reason);
  const amount = requireAmount(amountCents, maxCents);

  const stripeRefundId = await refundCapturedPayment(pkg.stripePaymentIntentId, amount);
  await prisma.$transaction([
    prisma.sessionPackage.update({
      where: { id: pkg.id },
      data: { sessionsCashRefunded: { increment: unused }, status: "DEPLETED" },
    }),
    prisma.refund.create({
      data: { kind: "PACKAGE_UNUSED", packageId: pkg.id, amountCents: amount, sessionCount: unused, reason: why, refundedById: adminUserId, stripeRefundId },
    }),
    prisma.report.updateMany({
      where: { targetType: "SESSION_PACKAGE", targetId: pkg.id, status: "OPEN" },
      data: { status: "REVIEWED" },
    }),
  ]);
  return { refundedCents: amount, sessionsRefunded: unused };
}

type RefundableBooking = {
  packageId: string | null;
  stripePaymentIntentId: string | null;
  paymentStatus: string;
  priceCents: number;
  discountCents: number;
  package?: { stripePaymentIntentId: string | null } | null;
};

/** Charged by card (the booking's own PaymentIntent or its package's) with money left to refund. */
export function isCardRefundable(b: RefundableBooking, refundedCents: number): boolean {
  const paid = b.paymentStatus === "CAPTURED" || b.paymentStatus === "PARTIALLY_REFUNDED";
  const intent = b.stripePaymentIntentId ?? b.package?.stripePaymentIntentId ?? null;
  return paid && !!intent && bookingChargeCents(b) - refundedCents > 0;
}

/** What waiving a late cancellation would do, in the words shown to the admin before they confirm. */
export function waiveOutcomeText(b: RefundableBooking, refundedCents: number): string {
  if (b.packageId) return "Waiving puts the session back into the parent's package.";
  const credit = b.discountCents > 0 ? ` and returns the ${formatCents(b.discountCents)} referral credit it used` : "";
  if (!b.stripePaymentIntentId) return `Waiving returns the ${formatCents(b.discountCents)} referral credit the session used.`;
  if (b.paymentStatus === "AUTHORIZED") return `The late charge didn't go through. Waiving releases the card hold${credit}, so the parent pays nothing.`;
  return `Waiving refunds the remaining ${formatCents(bookingChargeCents(b) - refundedCents)}${credit}, so the parent pays nothing.`;
}
