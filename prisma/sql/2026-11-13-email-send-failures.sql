-- Emails that didn't go out at all: Resend rejected or couldn't be reached, or the API key or
-- sender is missing in production. Shown under "Email problems" on /admin/jobs, with a retry for
-- password reset and booking emails. See src/lib/emailFailureStore.ts and src/lib/emailRetry.ts.
-- Additive only. Apply to Turso BEFORE merging: scripts/apply-sql.mjs (dry run by default).
-- Nothing existing changes.

CREATE TABLE "EmailSendFailure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    -- Short and safe: e.g. "Resend 401 validation_error". Never the key, the body or any link.
    "reason" TEXT NOT NULL,
    -- How to rebuild the email for a retry (null: can't be retried, only marked reviewed).
    -- retryRef is a User, Booking or SessionPackage id; retryParams is small JSON with no content.
    "retryKind" TEXT,
    "retryRef" TEXT,
    "retryParams" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastRetryAt" DATETIME,
    "lastRetryError" TEXT,
    -- "RESENT" (a retry went out) or "REVIEWED" (an admin marked it handled).
    "resolution" TEXT,
    "resolvedAt" DATETIME,
    "resolvedById" TEXT,
    CONSTRAINT "EmailSendFailure_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "EmailSendFailure_resolvedAt_createdAt_idx" ON "EmailSendFailure"("resolvedAt", "createdAt");
