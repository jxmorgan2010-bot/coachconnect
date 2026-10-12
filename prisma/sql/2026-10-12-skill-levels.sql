-- feature/skill-levels: the levels each coach takes per sport, each child's level per sport,
-- and the level a booking was checked against.
--
-- Additive only: ADD COLUMN, CREATE TABLE, CREATE INDEX. Nothing is dropped, rewritten,
-- copied or renamed. (`prisma migrate diff` would rebuild CoachSport with a table copy to add
-- the defaulted columns; plain ADD COLUMN does the same thing in place.)
--
-- Existing coaches take every level: SQLite fills a NOT NULL DEFAULT column into every
-- existing row, so each current CoachSport row reads all four flags as true. Existing
-- children have no ChildSportLevel rows (their parent is asked at booking), and existing
-- bookings read childLevel as NULL.
--
-- Verified: applied to a copy of the pre-change database, `prisma migrate diff` against
-- prisma/schema.prisma reports no differences.
--
-- Apply to Turso only after review:   turso db shell <db-name> < prisma/sql/2026-10-12-skill-levels.sql
-- Run it once. Re-running fails on "duplicate column name" before changing anything else.

-- Levels a coach takes for each sport they coach.
ALTER TABLE "CoachSport" ADD COLUMN "acceptsBeginner" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CoachSport" ADD COLUMN "acceptsIntermediate" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CoachSport" ADD COLUMN "acceptsAdvanced" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CoachSport" ADD COLUMN "acceptsCompetitive" BOOLEAN NOT NULL DEFAULT true;

-- The child's level at booking time, shown to the coach.
ALTER TABLE "Booking" ADD COLUMN "childLevel" TEXT;

-- One level per child per sport, set by the parent.
CREATE TABLE "ChildSportLevel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "childId" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChildSportLevel_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ChildSportLevel_childId_sport_key" ON "ChildSportLevel"("childId", "sport");
