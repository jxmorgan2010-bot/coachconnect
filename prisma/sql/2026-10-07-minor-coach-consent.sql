-- feature/minor-coach-consent: parent/guardian consent records for under-18 coaches,
-- age/identity verification notes for every coach, and a reason on platform-cancelled bookings.
--
-- Additive only: ADD COLUMN, CREATE TABLE, CREATE INDEX. Nothing is dropped, rewritten,
-- copied or renamed. Every new column is nullable or has a constant default, so SQLite/libSQL
-- adds them in place and existing rows read as NULL / false.
--
-- Verified: applied to a copy of the pre-change database, `prisma migrate diff` against
-- prisma/schema.prisma reports no differences.
--
-- Apply to Turso only after review:   turso db shell <db-name> < prisma/sql/2026-10-07-minor-coach-consent.sql
-- Run it once. Re-running fails on "duplicate column name" before changing anything else.

-- Platform-initiated cancellations (a guardian revoking consent cancels the minor coach's
-- upcoming sessions).
ALTER TABLE "Booking" ADD COLUMN "cancelledAt" DATETIME;
ALTER TABLE "Booking" ADD COLUMN "cancelReason" TEXT;

-- How an admin confirmed a coach's age and identity, for every coach.
ALTER TABLE "CoachProfile" ADD COLUMN "ageIdentityVerificationMethod" TEXT;
ALTER TABLE "CoachProfile" ADD COLUMN "ageIdentityVerifiedAt" DATETIME;
ALTER TABLE "CoachProfile" ADD COLUMN "ageIdentityVerifiedById" TEXT;

-- One row per consent link; the signature and revocation record live on the same row.
-- Only SHA-256 hashes of the consent and revoke tokens are stored.
CREATE TABLE "MinorConsent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "coachProfileId" TEXT NOT NULL,
    "guardianName" TEXT NOT NULL,
    "guardianEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" DATETIME,
    "completedAt" DATETIME,
    "consentTextVersion" TEXT,
    "acknowledgedKeys" TEXT,
    "signerLegalName" TEXT,
    "signerRelationship" TEXT,
    "typedSignature" TEXT,
    "confirmedAdult" BOOLEAN NOT NULL DEFAULT false,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "signerIp" TEXT,
    "signerUserAgent" TEXT,
    "revokeTokenHash" TEXT,
    "revokedAt" DATETIME,
    "revokeIp" TEXT,
    "revokeUserAgent" TEXT,
    CONSTRAINT "MinorConsent_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MinorConsent_tokenHash_key" ON "MinorConsent"("tokenHash");
CREATE UNIQUE INDEX "MinorConsent_revokeTokenHash_key" ON "MinorConsent"("revokeTokenHash");
CREATE INDEX "MinorConsent_coachProfileId_createdAt_idx" ON "MinorConsent"("coachProfileId", "createdAt");
