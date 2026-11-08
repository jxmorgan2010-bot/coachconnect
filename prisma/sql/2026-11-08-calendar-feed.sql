-- Private calendar feed: one per user (parent or coach), so sessions show up in the phone's
-- calendar app. See src/lib/calendarFeed.ts.
-- Additive only. Apply to Turso BEFORE merging: scripts/apply-sql.mjs (dry run by default).
-- Nothing existing changes: users have no feed until they create one on the Family page or
-- the coach dashboard.

CREATE TABLE "CalendarFeed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    -- SHA-256 of the secret in the feed link. The secret itself is never stored.
    "tokenHash" TEXT NOT NULL,
    -- JSON array of Child ids to include. NULL means every child, including ones added later.
    "childIds" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Last time the link was reset (the old link stopped working at that moment).
    "resetAt" DATETIME,
    "lastFetchedAt" DATETIME,
    -- Rate limit, counted in the database because Vercel functions share no memory.
    "rateWindowStart" DATETIME,
    "rateWindowCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CalendarFeed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CalendarFeed_userId_key" ON "CalendarFeed"("userId");
CREATE UNIQUE INDEX "CalendarFeed_tokenHash_key" ON "CalendarFeed"("tokenHash");
