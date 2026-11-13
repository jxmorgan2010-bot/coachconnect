-- Teen interest list: 16- and 17-year-olds who tried coach signup while Assist Coaching takes
-- 18+ coaches only. No account is created. See src/lib/teenInterest.ts.
-- Additive only. Apply to Turso BEFORE merging: scripts/apply-sql.mjs (dry run by default).
-- Nothing existing changes.

CREATE TABLE "TeenInterestEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstName" TEXT NOT NULL,
    -- Lowercased. One entry per address; signing up again updates it.
    "email" TEXT NOT NULL,
    -- Comma-separated Sport values, e.g. "SOCCER,TENNIS".
    "sports" TEXT NOT NULL,
    "school" TEXT NOT NULL,
    "gradYear" INTEGER NOT NULL,
    -- Kept for later; nothing is emailed to it.
    "parentEmail" TEXT,
    -- The date they turn 18 (UTC midnight of the calendar date). Their date of birth isn't stored.
    "turns18On" DATETIME NOT NULL,
    "contactedAt" DATETIME,
    -- SHA-256 of the secret in the removal link. The secret itself is never stored.
    "removeTokenHash" TEXT NOT NULL,
    -- Last confirmation email, so a repeat signup can't send more than one a day.
    "confirmationSentAt" DATETIME
);
CREATE UNIQUE INDEX "TeenInterestEntry_email_key" ON "TeenInterestEntry"("email");
CREATE UNIQUE INDEX "TeenInterestEntry_removeTokenHash_key" ON "TeenInterestEntry"("removeTokenHash");
