import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import AdminHeader from "@/components/AdminHeader";
import Badge from "@/components/Badge";
import { formatCents, AUTO_RELEASE_GRACE_HOURS } from "@/lib/money";
import { formatPacificDateTime } from "@/lib/sessionTiming";
import { bookingChargeCents } from "@/lib/cancellation";
import { holdFixDeadline } from "@/lib/holdTiming";
import { JOB_LABELS, JOB_SLUGS, NOTHING_DUE, type JobName } from "@/lib/jobs/runLog";
import { isRetryKind, RETRY_KIND_LABELS } from "@/lib/emailRetry";
import { ClearFlagButton, EmailFailureButtons, ReviewReplacementButton, RunJobButton } from "./JobButtons";

type Replacement = {
  id: string;
  createdAt: Date;
  toEmail: string;
  subject: string;
  part: string;
  categories: string;
  originalText: string;
  sentText: string;
};

/** What was replaced in one sent email, original next to what went out. */
function ReplacementDetail({ r }: { r: Replacement }) {
  return (
    <>
      <p className="font-bold break-words text-ink">&ldquo;{r.subject}&rdquo;</p>
      <p className="text-sm break-words text-muted-foreground">
        {formatPacificDateTime(r.createdAt)} · to {r.toEmail} · {r.part} · matched: {r.categories.replaceAll("_", " ")}
      </p>
      <dl className="grid w-full gap-2 text-sm sm:grid-cols-2">
        <div className="min-w-0 rounded-md border-2 border-line bg-chalk p-2">
          <dt className="eyebrow mb-1 text-muted-foreground">Original</dt>
          <dd className="break-words whitespace-pre-wrap text-ink">{r.originalText}</dd>
        </div>
        <div className="min-w-0 rounded-md border-2 border-line bg-surface p-2">
          <dt className="eyebrow mb-1 text-muted-foreground">Sent</dt>
          <dd className="break-words whitespace-pre-wrap text-ink">{r.sentText}</dd>
        </div>
      </dl>
    </>
  );
}

type Failure = {
  id: string;
  createdAt: Date;
  toEmail: string;
  subject: string;
  reason: string;
  retryKind: string | null;
  retryCount: number;
  lastRetryAt: Date | null;
  lastRetryError: string | null;
  resolution: string | null;
  resolvedAt: Date | null;
};

/** An email that never went out: what, to whom, why, and any retries. */
function FailureDetail({ f }: { f: Failure }) {
  return (
    <>
      <p className="font-bold break-words text-ink">&ldquo;{f.subject}&rdquo;</p>
      <p className="text-sm break-words text-muted-foreground">
        {formatPacificDateTime(f.createdAt)} · to {f.toEmail}
        {isRetryKind(f.retryKind) && ` · ${RETRY_KIND_LABELS[f.retryKind]}`}
      </p>
      <p className="text-sm break-words text-ink">
        <span className="font-bold">Why:</span> {f.reason}
      </p>
      {f.retryCount > 0 && f.lastRetryAt && (
        <p className="text-sm break-words text-ink">
          <span className="font-bold">
            Retried {f.retryCount} {f.retryCount === 1 ? "time" : "times"}, last {formatPacificDateTime(f.lastRetryAt)}
            {f.lastRetryError ? ":" : "."}
          </span>{" "}
          {f.lastRetryError}
        </p>
      )}
    </>
  );
}

const HOUR = 60 * 60 * 1000;
// cron-job.org runs each job every 15 to 30 minutes; 90 minutes without a finished run means it
// isn't running.
const STALE_AFTER_MS = 1.5 * HOUR;

const RUN_STATUS_VARIANT = { OK: "success", PARTIAL: "warning", FAILED: "danger", RUNNING: "neutral" } as const;

const FLAG_TEXT: Record<string, string> = {
  HOLD_NOT_FIXED: "Cancelled automatically: the card hold failed and the parent didn't update the card in time. No one was charged. Follow up with the family if needed.",
  CHARGE_FAILED: "Auto-release couldn't charge the card. The session isn't completed. Sort out payment with the parent (or in Stripe), then mark handled to let the next run try again.",
};

function SectionTitle({ id, title, count }: { id: string; title: string; count?: number }) {
  return (
    <h2 id={id} className="mb-3 font-display text-3xl text-ink">
      {title} {count !== undefined && <span className="ml-1 font-sans text-sm font-bold text-muted-foreground">{count}</span>}
    </h2>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border-2 border-dashed border-line px-4 py-3 text-sm text-muted-foreground">{children}</p>;
}

type AttentionBooking = {
  id: string;
  scheduledAt: Date;
  priceCents: number;
  discountCents: number;
  parentProfile: { user: { name: string } };
  coachProfile: { user: { name: string } };
};

function BookingLine({ b }: { b: AttentionBooking }) {
  return (
    <>
      <p className="font-bold text-ink">
        {b.parentProfile.user.name} <span className="font-normal text-muted-foreground">with</span> {b.coachProfile.user.name}
      </p>
      <p className="text-sm text-muted-foreground">
        Session {formatPacificDateTime(b.scheduledAt)} · {formatCents(bookingChargeCents(b))} · Booking{" "}
        <code className="break-all">{b.id}</code>
      </p>
    </>
  );
}

export default async function AdminJobsPage() {
  const session = await getCurrentSession();
  if (!session?.user) redirect("/login?callbackUrl=/admin/jobs");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const now = new Date();
  const people = { parentProfile: { include: { user: true } }, coachProfile: { include: { user: true } } } as const;
  const jobs = Object.entries(JOB_SLUGS) as [string, JobName][];

  // Three jobs on that schedule is 140 or more runs a day, nearly all "Nothing due.", so only runs that
  // did something or failed are listed; "Last good run" above shows the quiet ones are happening.
  const quiet = { status: "OK", succeeded: 0, summary: NOTHING_DUE };
  const [runs, quietCount, lastGood, flagged, waitingOnParent, overdueHolds, overdueReleases, toReview, reviewed, failures, resolvedFailures] = await Promise.all([
    prisma.jobRun.findMany({ where: { NOT: quiet }, orderBy: { startedAt: "desc" }, take: 40 }),
    prisma.jobRun.count({ where: quiet }),
    Promise.all(
      jobs.map(([, job]) =>
        prisma.jobRun.findFirst({ where: { job, status: { in: ["OK", "PARTIAL"] } }, orderBy: { startedAt: "desc" } }),
      ),
    ),
    prisma.booking.findMany({ where: { adminFlag: { not: null } }, include: people, orderBy: { adminFlaggedAt: "desc" } }),
    prisma.booking.findMany({
      where: { status: "CONFIRMED", stripePaymentIntentId: null, holdFailedAt: { not: null } },
      include: people,
      orderBy: { scheduledAt: "asc" },
    }),
    // Due over an hour ago and not placed or failed: the job isn't reaching them.
    prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        stripePaymentIntentId: null,
        holdFailedAt: null,
        holdDueAt: { lt: new Date(now.getTime() - HOUR) },
        scheduledAt: { gt: now },
      },
      include: people,
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        adminFlag: null,
        dispute: { is: null },
        scheduledAt: { lt: new Date(now.getTime() - (AUTO_RELEASE_GRACE_HOURS + 1) * HOUR) },
      },
      include: people,
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.emailTextReplacement.findMany({ where: { reviewedAt: null }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.emailTextReplacement.findMany({ where: { reviewedAt: { not: null } }, orderBy: { reviewedAt: "desc" }, take: 10 }),
    prisma.emailSendFailure.findMany({ where: { resolvedAt: null }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.emailSendFailure.findMany({ where: { resolvedAt: { not: null } }, orderBy: { resolvedAt: "desc" }, take: 10 }),
  ]);
  // Exact check on the session's end, as the job does, plus an hour's slack.
  const lateReleases = overdueReleases.filter(
    (b) => b.scheduledAt.getTime() + b.durationMinutes * 60_000 + (AUTO_RELEASE_GRACE_HOURS + 1) * HOUR < now.getTime(),
  );
  const stale = jobs.filter((_, i) => !lastGood[i] || now.getTime() - lastGood[i]!.startedAt.getTime() > STALE_AFTER_MS);
  const attentionCount = flagged.length + waitingOnParent.length + overdueHolds.length + lateReleases.length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 md:py-12">
      <AdminHeader title="Scheduled jobs">
        Card holds 2 days before each session, auto-release {AUTO_RELEASE_GRACE_HOURS} hours after, and reminders. The
        scheduler (cron-job.org) runs them automatically; you can also run one now.
      </AdminHeader>

      <div className="flex flex-col gap-10">
        <section aria-labelledby="jobs">
          <SectionTitle id="jobs" title="Jobs" />
          {stale.length > 0 && (
            <p className="mb-3 rounded-lg border-2 border-ink bg-warning/15 p-3 text-sm text-ink">
              <span className="font-bold">No successful run in the last 90 minutes for {stale.map(([, job]) => JOB_LABELS[job]).join(", ")}.</span>{" "}
              The scheduler may not be running: check cron-job.org and the CRON_SECRET settings.
            </p>
          )}
          <ul className="grid gap-3 md:grid-cols-3">
            {jobs.map(([slug, job], i) => (
              <li key={job} className="card-flat flex flex-col gap-3 p-4">
                <div>
                  <p className="font-bold text-ink">{JOB_LABELS[job]}</p>
                  <p className="text-sm text-muted-foreground">
                    {lastGood[i] ? `Last good run ${formatPacificDateTime(lastGood[i]!.startedAt)}` : "No successful run yet"}
                  </p>
                </div>
                <RunJobButton slug={slug} label={JOB_LABELS[job]} />
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="attention">
          <SectionTitle id="attention" title="Needs attention" count={attentionCount} />
          {attentionCount === 0 ? (
            <Empty>Nothing needs attention.</Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {flagged.map((b) => (
                <li key={b.id} className="card flex flex-col items-start gap-2 p-4 sm:p-5">
                  <Badge variant="danger">{b.adminFlag === "HOLD_NOT_FIXED" ? "Cancelled, card not fixed" : "Charge failed"}</Badge>
                  <BookingLine b={b} />
                  <p className="text-sm text-ink">{FLAG_TEXT[b.adminFlag ?? ""] ?? b.adminFlag}</p>
                  <ClearFlagButton bookingId={b.id} retries={b.adminFlag === "CHARGE_FAILED" && b.status === "CONFIRMED"} />
                </li>
              ))}
              {waitingOnParent.map((b) => (
                <li key={b.id} className="card flex flex-col items-start gap-2 p-4 sm:p-5">
                  <Badge variant="warning">Waiting on the parent&apos;s card</Badge>
                  <BookingLine b={b} />
                  <p className="text-sm text-ink">
                    The hold failed ({b.holdFailureCode ?? "unknown"}) on {formatPacificDateTime(b.holdFailedAt!)} and the parent
                    was emailed. If the card isn&apos;t updated by {formatPacificDateTime(holdFixDeadline(b.scheduledAt))}, the
                    session is cancelled automatically.
                  </p>
                </li>
              ))}
              {overdueHolds.map((b) => (
                <li key={b.id} className="card flex flex-col items-start gap-2 p-4 sm:p-5">
                  <Badge variant="danger">Hold overdue</Badge>
                  <BookingLine b={b} />
                  <p className="text-sm text-ink">
                    The hold was due {formatPacificDateTime(b.holdDueAt!)} and hasn&apos;t been placed. Run card holds now, and
                    check the scheduler.
                  </p>
                </li>
              ))}
              {lateReleases.map((b) => (
                <li key={b.id} className="card flex flex-col items-start gap-2 p-4 sm:p-5">
                  <Badge variant="danger">Auto-release overdue</Badge>
                  <BookingLine b={b} />
                  <p className="text-sm text-ink">
                    More than {AUTO_RELEASE_GRACE_HOURS} hours since this session ended and it&apos;s still not completed. Run
                    auto-release now, and check the scheduler.
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="email-problems">
          <SectionTitle id="email-problems" title="Email problems" count={failures.length + toReview.length} />

          <h3 id="emails-not-sent" className="mb-1 text-base font-bold text-ink">
            Not sent <span className="ml-1 text-sm text-muted-foreground">{failures.length}</span>
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Resend rejected these or couldn&apos;t be reached, or the email key is missing in production. Retry rebuilds the
            email from the booking or account as it is now, and won&apos;t send one that&apos;s no longer right (a password reset
            gets a new link). If Resend did deliver but didn&apos;t answer, a retry sends it twice.
          </p>
          {failures.length === 0 ? (
            <Empty>Every email has gone out.</Empty>
          ) : (
            <ul className="flex flex-col gap-3" aria-labelledby="emails-not-sent">
              {failures.map((f) => (
                <li key={f.id} className="card flex flex-col items-start gap-2 p-4 sm:p-5">
                  <Badge variant="danger">Not sent</Badge>
                  <FailureDetail f={f} />
                  <EmailFailureButtons id={f.id} canRetry={isRetryKind(f.retryKind)} lastRetryError={f.lastRetryError} />
                </li>
              ))}
            </ul>
          )}

          <h3 id="emails-text-removed" className="mt-8 mb-1 text-base font-bold text-ink">
            Sent with text removed <span className="ml-1 text-sm text-muted-foreground">{toReview.length}</span>
          </h3>
          <p className="mb-3 text-sm text-muted-foreground">
            When part of an email matches the contact-info filter, only that text is replaced with [removed] and the email
            still goes out. Check each one: a person may have typed contact details, or an email&apos;s own wording may need
            fixing.
          </p>
          {toReview.length === 0 ? (
            <Empty>No emails have needed text removed.</Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {toReview.map((r) => (
                <li key={r.id} className="card flex flex-col items-start gap-2 p-4 sm:p-5">
                  <Badge variant="warning">Text removed, email sent</Badge>
                  <ReplacementDetail r={r} />
                  <ReviewReplacementButton id={r.id} />
                </li>
              ))}
            </ul>
          )}
          {reviewed.length + resolvedFailures.length > 0 && (
            <details className="mt-3">
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-bold text-ink">
                Recently resolved ({reviewed.length + resolvedFailures.length})
              </summary>
              <ul className="mt-2 flex flex-col gap-2">
                {resolvedFailures.map((f) => (
                  <li key={f.id} className="card-flat flex flex-col items-start gap-2 p-3 sm:p-4">
                    <Badge variant={f.resolution === "RESENT" ? "success" : "neutral"}>
                      {f.resolution === "RESENT" ? "Resent" : "Not sent, marked reviewed"} {formatPacificDateTime(f.resolvedAt!)}
                    </Badge>
                    <FailureDetail f={f} />
                  </li>
                ))}
                {reviewed.map((r) => (
                  <li key={r.id} className="card-flat flex flex-col items-start gap-2 p-3 sm:p-4">
                    <Badge variant="neutral">Text removed, reviewed</Badge>
                    <ReplacementDetail r={r} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section aria-labelledby="runs">
          <SectionTitle id="runs" title="Recent runs" count={runs.length} />
          <p className="-mt-1 mb-3 text-sm text-muted-foreground">
            Runs that did something or had a failure, newest first. {quietCount} run{quietCount === 1 ? "" : "s"} with nothing
            due in the last 30 days {quietCount === 1 ? "isn't" : "aren't"} listed. Runs are kept for 30 days, or 90 days
            if anything failed.
          </p>
          {runs.length === 0 ? (
            <Empty>Nothing yet. Runs appear here once the scheduler is set up, or when you run a job now.</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {runs.map((r) => (
                <li key={r.id} className={`${r.status === "OK" ? "card-flat" : "card"} flex flex-col gap-1.5 p-3 sm:p-4`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={RUN_STATUS_VARIANT[r.status as keyof typeof RUN_STATUS_VARIANT] ?? "neutral"}>{r.status}</Badge>
                    <span className="font-bold text-ink">{JOB_LABELS[r.job as JobName] ?? r.job}</span>
                    <span className="text-sm text-muted-foreground">
                      {formatPacificDateTime(r.startedAt)} · {r.trigger === "ADMIN" ? "Run now" : "Scheduler"}
                      {r.finishedAt && ` · ${(Math.max(0, r.finishedAt.getTime() - r.startedAt.getTime()) / 1000).toFixed(1)}s`}
                    </span>
                  </div>
                  <p className="text-sm text-ink">{r.summary ?? "Still running, or stopped before finishing."}</p>
                  {r.failures && (
                    <pre className="overflow-x-auto rounded-md border-2 border-line bg-chalk p-2 text-xs whitespace-pre-wrap text-ink">
                      {r.failures}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
