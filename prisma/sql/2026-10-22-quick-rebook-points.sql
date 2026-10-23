-- fix/quick-rebook: remember which bookings were made with quick rebook, so their 10
-- QUICK_REBOOK points are awarded when the session is completed rather than when it's
-- booked (a cancelled rebook then earns nothing).
--
-- Additive only: one ADD COLUMN with a constant default, so SQLite/libSQL adds it in place
-- and existing rows read as false. Rebooks made before this got their points at booking
-- time; reading as false means they are never paid a second time.
--
-- Verified: applied to a copy of the pre-change database, `prisma migrate diff` against
-- prisma/schema.prisma reports no differences.
--
-- Apply to Turso only after review:   turso db shell <db-name> < prisma/sql/2026-10-22-quick-rebook-points.sql
-- Run it once. Re-running fails on "duplicate column name" before changing anything else.

ALTER TABLE "Booking" ADD COLUMN "bookedViaQuickRebook" BOOLEAN NOT NULL DEFAULT false;
