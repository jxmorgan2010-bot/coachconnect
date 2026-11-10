import { runCardHoldsJob } from "@/lib/cardHolds";
import { runAutoReleaseJob } from "@/lib/autoRelease";
import { runRemindersJob } from "@/lib/reminders";
import { cleanUpJobRuns } from "@/lib/jobs/jobRunCleanup";
import { JOB_SLUGS, runJob, type JobLog, type JobName, type JobTrigger } from "@/lib/jobs/runLog";

const WORK: Record<JobName, (log: JobLog, now: Date) => Promise<void>> = {
  CARD_HOLDS: runCardHoldsJob,
  AUTO_RELEASE: runAutoReleaseJob,
  REMINDERS: runRemindersJob,
};

/** "card-holds" -> CARD_HOLDS, or null for anything that isn't a job. */
export function jobFromSlug(slug: string): JobName | null {
  return Object.hasOwn(JOB_SLUGS, slug) ? JOB_SLUGS[slug as keyof typeof JOB_SLUGS] : null;
}

export function runNamedJob(job: JobName, trigger: JobTrigger) {
  if (job === "REMINDERS") {
    // Reminders also clears out old JobRun rows, once a day: it's the one job that touches no payments.
    return runJob(job, trigger, async (log, now) => {
      await runRemindersJob(log, now);
      await cleanUpJobRuns(log, now, trigger);
    });
  }
  return runJob(job, trigger, WORK[job]);
}
