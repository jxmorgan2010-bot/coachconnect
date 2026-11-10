import { prisma } from "@/lib/prisma";
import { failureReason, type JobLog, type JobTrigger } from "@/lib/jobs/runLog";
import { CLEANUP_LABEL, oldJobRunsWhere, shouldCleanUp } from "@/lib/jobs/jobRunRetention";

const HOUR = 60 * 60 * 1000;

/** Deletes JobRun rows past their keep time (see jobRunRetention.ts) and returns how many. */
export async function deleteOldJobRuns(now: Date): Promise<number> {
  const { count } = await prisma.jobRun.deleteMany({ where: oldJobRunsWhere(now) });
  return count;
}

/**
 * Runs after the Reminders job's own work, once a day (or on "Run now"). The count goes into the
 * run's summary; when nothing was deleted it adds nothing, so a quiet run stays quiet. An error is
 * recorded as a failure of this run (it shows as PARTIAL on /admin/jobs) and never stops reminders,
 * which have already gone out by then.
 */
export async function cleanUpJobRuns(log: JobLog, now: Date, trigger: JobTrigger) {
  try {
    const earlier =
      trigger === "SCHEDULER"
        ? await prisma.jobRun.findMany({
            where: { job: "REMINDERS", trigger: "SCHEDULER", startedAt: { gte: new Date(now.getTime() - HOUR), lt: now } },
            select: { startedAt: true },
          })
        : [];
    if (!shouldCleanUp(trigger, now, earlier.map((r) => r.startedAt))) return;
    const deleted = await deleteOldJobRuns(now);
    if (deleted > 0) log.count(CLEANUP_LABEL, deleted);
  } catch (err) {
    console.error("[jobs] couldn't delete old job runs", err);
    log.fail("cleanup", failureReason(err));
  }
}
