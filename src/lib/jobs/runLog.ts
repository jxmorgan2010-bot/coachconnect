import { prisma } from "@/lib/prisma";

/**
 * Every scheduled job runs through runJob(): one JobRun row per run (shown on /admin/jobs), each
 * booking handled on its own so one failure never stops the rest, and a console line per run for
 * the Vercel logs. Old runs are deleted once a day by the Reminders job (jobRunCleanup.ts). Failures record a booking id and a short reason (a Stripe decline code, an
 * error type), never names, emails or card details.
 */

export const JOB_SLUGS = {
  "card-holds": "CARD_HOLDS",
  "auto-release": "AUTO_RELEASE",
  reminders: "REMINDERS",
} as const;
export type JobSlug = keyof typeof JOB_SLUGS;
export type JobName = (typeof JOB_SLUGS)[JobSlug];
export type JobTrigger = "SCHEDULER" | "ADMIN";

export const JOB_LABELS: Record<JobName, string> = {
  CARD_HOLDS: "Card holds",
  AUTO_RELEASE: "Auto-release",
  REMINDERS: "Reminders",
};

export const NOTHING_DUE = "Nothing due.";
const MAX_FAILURES = 40;

/** A short, log-safe reason for a failure: error type and code, or a trimmed message with no email addresses. */
export function failureReason(err: unknown): string {
  const e = err as { type?: string; code?: string; decline_code?: string; message?: string };
  if (e?.type?.startsWith("Stripe")) return [e.type, e.decline_code || e.code].filter(Boolean).join(" ");
  const message = (e?.message ?? String(err)).split("\n")[0];
  return message.replace(/\S+@\S+/g, "[email]").slice(0, 160);
}

export class JobLog {
  succeeded = 0;
  failed = 0;
  readonly counts: Record<string, number> = {};
  readonly failures: string[] = [];

  /** Something happened that's worth a line in the summary, e.g. "reminders sent". */
  count(label: string, n = 1) {
    this.counts[label] = (this.counts[label] ?? 0) + n;
  }

  ok(label: string) {
    this.succeeded++;
    this.count(label);
  }

  fail(ref: string, reason: string) {
    this.failed++;
    if (this.failures.length < MAX_FAILURES) this.failures.push(`${ref}: ${reason}`);
  }

  /** Runs `work` for each item; a throw is recorded as that item's failure and the run moves on. */
  async each<T extends { id: string }>(items: T[], work: (item: T) => Promise<void>) {
    for (const item of items) {
      try {
        await work(item);
      } catch (err) {
        console.error(`[jobs] booking ${item.id} failed`, err);
        this.fail(`booking ${item.id}`, failureReason(err));
      }
    }
  }
}

export type JobResult = { job: JobName; status: "OK" | "PARTIAL" | "FAILED"; succeeded: number; failed: number; summary: string };

export async function runJob(
  job: JobName,
  trigger: JobTrigger,
  work: (log: JobLog, now: Date) => Promise<void>,
  now: Date = new Date(),
): Promise<JobResult> {
  const run = await prisma.jobRun.create({ data: { job, trigger, startedAt: now } });
  const log = new JobLog();
  let status: JobResult["status"];
  try {
    await work(log, now);
    status = log.failed > 0 ? "PARTIAL" : "OK";
  } catch (err) {
    console.error(`[jobs] ${job} stopped`, err);
    status = "FAILED";
    log.fail("run stopped", failureReason(err));
  }

  const summary = Object.entries(log.counts).map(([label, n]) => `${label}: ${n}`).join(", ") || (log.failed ? "Nothing completed. See failures." : NOTHING_DUE);
  await prisma.jobRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      status,
      succeeded: log.succeeded,
      failed: log.failed,
      summary,
      failures: log.failures.length ? log.failures.join("\n") : null,
    },
  });

  console.log(`[jobs] ${job} (${trigger}) ${status}: ${summary}${log.failed ? ` (${log.failed} failed)` : ""}`);
  return { job, status, succeeded: log.succeeded, failed: log.failed, summary };
}
