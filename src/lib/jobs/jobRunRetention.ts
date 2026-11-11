import { toPacificParts } from "@/lib/availability";
import type { JobTrigger } from "@/lib/jobs/runLog";

/**
 * How long JobRun rows are kept, and when the Reminders job clears out old ones. Pure (no DB) so
 * the timing can be unit tested; the delete itself is in jobRunCleanup.ts.
 *
 * Three jobs every 15 minutes write about 288 rows a day. Runs that finished OK with nothing
 * failed are kept 30 days; anything else (PARTIAL, FAILED, or a run that never finished and is
 * still RUNNING) is kept 90 days so a failure can still be looked into weeks later.
 */

export const KEEP_RUNS_DAYS = 30;
export const KEEP_FAILED_RUNS_DAYS = 90;
export const CLEANUP_LABEL = "old job runs deleted";

const DAY = 24 * 60 * 60 * 1000;
const CLEANUP_HOUR = 3; // 3 AM Pacific, when nothing else is going on.

/** The deleteMany filter: clean runs past 30 days, and every run past 90 days. */
export function oldJobRunsWhere(now: Date) {
  return {
    OR: [
      { startedAt: { lt: new Date(now.getTime() - KEEP_RUNS_DAYS * DAY) }, status: "OK", failed: 0 },
      { startedAt: { lt: new Date(now.getTime() - KEEP_FAILED_RUNS_DAYS * DAY) } },
    ],
  };
}

/** True for instants in the 3:00 to 3:59 AM hour, Pacific time (DST-safe). */
export function inCleanupHour(instant: Date): boolean {
  return Math.floor(toPacificParts(instant).minutes / 60) === CLEANUP_HOUR;
}

/**
 * Whether this Reminders run should clean up. "Run now" always does. A scheduled run does it once
 * a day: the first scheduled run in the 3 AM Pacific hour (whatever the schedule's interval, up to
 * an hour). `earlierRunStarts` are the start times of scheduled Reminders runs in the hour before
 * this one. If the 3 AM run is skipped, the next day's run catches up; nothing is lost.
 */
export function shouldCleanUp(trigger: JobTrigger, now: Date, earlierRunStarts: Date[]): boolean {
  if (trigger === "ADMIN") return true;
  if (!inCleanupHour(now)) return false;
  const today = toPacificParts(now).date;
  return !earlierRunStarts.some((t) => t < now && inCleanupHour(t) && toPacificParts(t).date === today);
}
