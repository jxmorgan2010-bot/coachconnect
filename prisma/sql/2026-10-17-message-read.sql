-- fix/message-notifications: unread message alerts for parents and coaches.
--
-- Additive only: ADD COLUMN and CREATE INDEX. Nothing is dropped, rewritten, copied or
-- renamed. Every existing message reads readAt as NULL, so messages sent before this change
-- show as unread to their recipient once, until that conversation is opened.
--
-- Apply to Turso only after review:   turso db shell <db-name> < prisma/sql/2026-10-17-message-read.sql
-- Run it once. Re-running fails on "duplicate column name" before changing anything else.

-- Set when the recipient opens the thread (POST /api/threads/[id]/read).
ALTER TABLE "Message" ADD COLUMN "readAt" DATETIME;

-- Unread counts for the navbar badge, polled every 30 seconds.
CREATE INDEX "Message_threadId_readAt_idx" ON "Message"("threadId", "readAt");
