-- feature/experienced-coaches: a second kind of coach (any adult, verified with a government
-- photo ID instead of a school ID), behind EXPERIENCED_COACHES_ENABLED in src/lib/features.ts.
--
-- Additive only: ADD COLUMN. Nothing is dropped, rewritten, copied or renamed. Every existing
-- coach reads coachType as 'STUDENT_ATHLETE' (the column default) and the other new columns as
-- NULL. An existing ID with a NULL idDocumentType is shown as a school ID, which all of them are.
--
-- Apply to Turso only after review:   turso db shell <db-name> < prisma/sql/2026-10-25-experienced-coaches.sql
-- Run it once. Re-running fails on "duplicate column name" before changing anything else.

-- Which kind of ID is stored at idPhotoPath: SCHOOL_ID, DRIVERS_LICENSE, STATE_ID or PASSPORT.
ALTER TABLE "CoachProfile" ADD COLUMN "idDocumentType" TEXT;

-- STUDENT_ATHLETE or EXPERIENCED. Set at signup.
ALTER TABLE "CoachProfile" ADD COLUMN "coachType" TEXT NOT NULL DEFAULT 'STUDENT_ATHLETE';

-- Experienced coaches only, all optional and self-reported (never verified).
ALTER TABLE "CoachProfile" ADD COLUMN "yearsCoaching" INTEGER;
ALTER TABLE "CoachProfile" ADD COLUMN "certifications" TEXT;
ALTER TABLE "CoachProfile" ADD COLUMN "playingHistory" TEXT;
