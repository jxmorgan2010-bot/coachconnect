-- feature/coach-profile-page: profile photos that wait for admin approval, and the
-- coach-reported Accommodations section.
--
-- Additive only: ADD COLUMN and CREATE INDEX. Nothing is dropped, rewritten, copied or
-- renamed. Every existing coach reads the new columns as NULL, except
-- specialNeedsExperience, which SQLite fills with false. Existing profile photos stay public
-- as they are; only photos uploaded after this change wait for approval.
--
-- Apply to Turso only after review:   turso db shell <db-name> < prisma/sql/2026-10-14-coach-profile-page.sql
-- Run it once. Re-running fails on "duplicate column name" before changing anything else.

-- Photo approval. profilePhotoUrl stays the photo families see until an admin approves the
-- pending one.
ALTER TABLE "CoachProfile" ADD COLUMN "pendingProfilePhotoUrl" TEXT;
ALTER TABLE "CoachProfile" ADD COLUMN "pendingProfilePhotoAt" DATETIME;
ALTER TABLE "CoachProfile" ADD COLUMN "profilePhotoRejectedAt" DATETIME;

-- Accommodations (coach-reported, never verified). languages is a JSON array of codes from
-- src/lib/accommodations.ts; travelRadiusMiles is 5, 10 or 20; NULL means "not said".
ALTER TABLE "CoachProfile" ADD COLUMN "specialNeedsExperience" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CoachProfile" ADD COLUMN "specialNeedsNote" TEXT;
ALTER TABLE "CoachProfile" ADD COLUMN "languages" TEXT;
ALTER TABLE "CoachProfile" ADD COLUMN "languagesOther" TEXT;
ALTER TABLE "CoachProfile" ADD COLUMN "travelRadiusMiles" INTEGER;
ALTER TABLE "CoachProfile" ADD COLUMN "bringsEquipment" BOOLEAN;
ALTER TABLE "CoachProfile" ADD COLUMN "accommodationsNote" TEXT;

-- The admin "Photos to review" queue.
CREATE INDEX "CoachProfile_pendingProfilePhotoAt_idx" ON "CoachProfile"("pendingProfilePhotoAt");
