-- Scheduler: card holds placed 2 days before the session, auto-release, reminders, and the
-- admin "Scheduled jobs" page.
-- Additive only. Apply to Turso BEFORE merging: scripts/apply-sql.mjs (dry run by default).
-- Existing bookings read holdDueAt as null, so nothing about them changes.

-- When the job should place the card hold. Null: placed at booking, or no card needed.
ALTER TABLE "Booking" ADD COLUMN "holdDueAt" DATETIME;
-- A job run is placing the hold (a short claim, so two runs can't place two holds).
ALTER TABLE "Booking" ADD COLUMN "holdClaimedAt" DATETIME;
ALTER TABLE "Booking" ADD COLUMN "holdPlacedAt" DATETIME;
-- Placing the hold failed and the parent was emailed. Stripe's decline code only.
ALTER TABLE "Booking" ADD COLUMN "holdFailedAt" DATETIME;
ALTER TABLE "Booking" ADD COLUMN "holdFailureCode" TEXT;
-- Needs an admin: HOLD_NOT_FIXED or CHARGE_FAILED.
ALTER TABLE "Booking" ADD COLUMN "adminFlag" TEXT;
ALTER TABLE "Booking" ADD COLUMN "adminFlaggedAt" DATETIME;
CREATE INDEX "Booking_status_holdDueAt_idx" ON "Booking"("status", "holdDueAt");

-- One row per job run.
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "job" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "failures" TEXT
);
CREATE INDEX "JobRun_job_startedAt_idx" ON "JobRun"("job", "startedAt");
