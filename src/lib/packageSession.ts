/**
 * A package session that went back into its package is stored as REFUNDED, the same status as a
 * session whose money an admin sent back (src/lib/refunds.ts). Only the second has a refund record
 * with an amount, so that's what tells them apart. A waived late cancel also has a record, with an
 * amount of 0: the session went back and no money moved.
 */
export function sessionReturnedToPackage(b: {
  packageId: string | null;
  paymentStatus: string;
  refunds: { amountCents: number }[];
}): boolean {
  return !!b.packageId && b.paymentStatus === "REFUNDED" && !b.refunds.some((r) => r.amountCents > 0);
}
