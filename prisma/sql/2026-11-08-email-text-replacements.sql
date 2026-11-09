-- Emails are never dropped for their content any more: sendEmail() replaces only the text the
-- contact-info filter matched, still sends, and records each replacement here for admins
-- (/admin/jobs). See src/lib/emailSafety.ts.
-- Additive only. Apply to Turso BEFORE merging: scripts/apply-sql.mjs (dry run by default).
-- Nothing existing changes.

CREATE TABLE "EmailTextReplacement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "toEmail" TEXT NOT NULL,
    -- As sent (already cleaned).
    "subject" TEXT NOT NULL,
    -- "subject", "paragraph 2", "button", "link 1", "footnote" or "whole email".
    "part" TEXT NOT NULL,
    -- Comma-separated filter categories, e.g. "email".
    "categories" TEXT NOT NULL,
    -- May hold contact details someone typed: admins only, never logged.
    "originalText" TEXT NOT NULL,
    "sentText" TEXT NOT NULL,
    "reviewedAt" DATETIME,
    "reviewedById" TEXT,
    CONSTRAINT "EmailTextReplacement_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "EmailTextReplacement_reviewedAt_createdAt_idx" ON "EmailTextReplacement"("reviewedAt", "createdAt");
