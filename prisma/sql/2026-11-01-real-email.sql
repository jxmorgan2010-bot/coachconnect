-- Real email (Resend): password reset, sign-out-everywhere, message alert throttling and
-- settings, and the one-time "coach waiting for review" admin alert.
-- Additive only. Apply to Turso BEFORE merging: scripts/apply-sql.mjs (dry run by default).

-- Bumped on password reset; sessions carrying an older version are rejected.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
-- New-message email alerts on/off. Account and booking emails always send.
ALTER TABLE "User" ADD COLUMN "messageEmailAlerts" BOOLEAN NOT NULL DEFAULT true;

-- Last new-message alert to each side of a conversation (at most one per hour).
ALTER TABLE "Thread" ADD COLUMN "parentAlertedAt" DATETIME;
ALTER TABLE "Thread" ADD COLUMN "coachAlertedAt" DATETIME;

-- When admins were told this coach is waiting for review.
ALTER TABLE "CoachProfile" ADD COLUMN "reviewAlertSentAt" DATETIME;

CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_createdAt_idx" ON "PasswordResetToken"("userId", "createdAt");

CREATE TABLE "PasswordResetRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ipHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PasswordResetRequest_ipHash_createdAt_idx" ON "PasswordResetRequest"("ipHash", "createdAt");
