-- feature/cancellation-policy: who cancelled a booking and whether it was a late (charged)
-- parent cancellation, unused package sessions refunded as money, and a ledger of every
-- admin refund and waiver (who, how much, why).
--
-- Additive only: ADD COLUMN, CREATE TABLE, CREATE INDEX. Nothing is dropped, rewritten,
-- copied or renamed. Every new column is nullable or has a constant default, so SQLite/libSQL
-- adds them in place and existing rows read as NULL / false / 0.
--
-- The schema also gains enum values (PaymentStatus.PARTIALLY_REFUNDED,
-- ReportTargetType.SESSION_PACKAGE, and the new CancelledBy / RefundKind enums). SQLite stores
-- enums as plain TEXT with no constraint, so those need no SQL.
--
-- Verified: applied to a copy of the pre-change database, `prisma migrate diff` against
-- prisma/schema.prisma reports no differences.
--
-- Apply to Turso only after review:   turso db shell <db-name> < prisma/sql/2026-10-22-cancellation-policy.sql
-- Run it once. Re-running fails on "duplicate column name" before changing anything else.

-- Who cancelled (PARENT, COACH or PLATFORM), and whether a parent cancelled after the
-- free-cancel deadline (11:59 PM Pacific the night before), which charges the full price.
ALTER TABLE "Booking" ADD COLUMN "cancelledBy" TEXT;
ALTER TABLE "Booking" ADD COLUMN "lateCancellation" BOOLEAN NOT NULL DEFAULT false;

-- Unused package sessions an admin refunded as money; they can no longer be booked.
ALTER TABLE "SessionPackage" ADD COLUMN "sessionsCashRefunded" INTEGER NOT NULL DEFAULT 0;

-- One row per admin refund or waiver. Kept even if the booking, package or dispute is deleted.
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "bookingId" TEXT,
    "packageId" TEXT,
    "disputeId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "sessionCount" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "refundedById" TEXT NOT NULL,
    "stripeRefundId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Refund_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Refund_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SessionPackage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Refund_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Refund_refundedById_fkey" FOREIGN KEY ("refundedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Refund_bookingId_idx" ON "Refund"("bookingId");
CREATE INDEX "Refund_packageId_idx" ON "Refund"("packageId");
