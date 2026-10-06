-- fix/message-moderation: off-platform contact policy (strikes, suspension, flagged log)
--
-- Additive only. Hand-written instead of Prisma's generated diff, which rebuilds the whole
-- User table (copy rows, drop, rename) to add columns. SQLite/libSQL can add columns with
-- constant defaults in place, which is safer on a live database.
--
-- Verified: applied to a copy of the pre-change database, `prisma migrate diff` against
-- prisma/schema.prisma reports no differences.
--
-- Apply to Turso only after review:   turso db shell <db-name> < prisma/sql/2026-10-06-contact-moderation.sql
-- Existing users get strikeCount 0 and isSuspended false. No rows are rewritten.

ALTER TABLE "User" ADD COLUMN "strikeCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "isSuspended" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "suspendedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "suspensionReason" TEXT;

CREATE TABLE "FlaggedAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "context" TEXT NOT NULL,
    "blockedText" TEXT NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT true,
    "strikeNumber" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedAt" DATETIME,
    "clearedById" TEXT,
    CONSTRAINT "FlaggedAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FlaggedAttempt_clearedById_fkey" FOREIGN KEY ("clearedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "FlaggedAttempt_userId_createdAt_idx" ON "FlaggedAttempt"("userId", "createdAt");
