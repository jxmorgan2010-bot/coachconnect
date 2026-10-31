-- fix/referral-rules: referral credits are decided at the referred parent's first completed,
-- card-paid session instead of at signup, and each decision is recorded with the card's
-- Stripe fingerprint so one card can't earn a referral reward twice.
--
-- Additive only: one ADD COLUMN with a constant default, one CREATE TABLE and its indexes.
-- Nothing is dropped, rewritten, copied or renamed. Existing parents read referralPending as
-- false: anyone referred before this change was already credited at signup and is never
-- credited a second time.
--
-- Verified: applied to a copy of the pre-change database, `prisma migrate diff` against
-- prisma/schema.prisma reports no differences.
--
-- Apply to Turso only after review:   turso db shell <db-name> < prisma/sql/2026-10-28-referral-rewards.sql
-- Run it once. Re-running fails on "duplicate column name" before changing anything else.

ALTER TABLE "ParentProfile" ADD COLUMN "referralPending" BOOLEAN NOT NULL DEFAULT false;

-- One row per referred parent: GRANTED, DUPLICATE_CARD or SELF_REFERRAL. cardFingerprint is
-- set only on GRANTED rows, so its unique index allows each card one reward.
CREATE TABLE "ReferralReward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referredParentId" TEXT NOT NULL,
    "referrerParentId" TEXT,
    "bookingId" TEXT,
    "outcome" TEXT NOT NULL,
    "cardFingerprint" TEXT,
    "creditCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralReward_referredParentId_fkey" FOREIGN KEY ("referredParentId") REFERENCES "ParentProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReferralReward_referrerParentId_fkey" FOREIGN KEY ("referrerParentId") REFERENCES "ParentProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReferralReward_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ReferralReward_referredParentId_key" ON "ReferralReward"("referredParentId");
CREATE UNIQUE INDEX "ReferralReward_bookingId_key" ON "ReferralReward"("bookingId");
CREATE UNIQUE INDEX "ReferralReward_cardFingerprint_key" ON "ReferralReward"("cardFingerprint");
CREATE INDEX "ReferralReward_referrerParentId_idx" ON "ReferralReward"("referrerParentId");
