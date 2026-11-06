import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/jobs/cronAuth";
import { jobFromSlug, runNamedJob } from "@/lib/jobs";

// Each run handles at most a few hundred bookings; this is a ceiling, not an expectation.
export const maxDuration = 60;

/**
 * The scheduler's entry point: /api/jobs/card-holds, /api/jobs/auto-release, /api/jobs/reminders.
 * Requires the CRON_SECRET bearer token and refuses everything else. GET is what Vercel Cron
 * sends; cron-job.org and the manual backup workflow (.github/workflows/scheduled-jobs.yml) use
 * POST. The response carries counts only, because the workflow's logs are public.
 */
async function handle(req: Request, { params }: { params: Promise<{ job: string }> }) {
  if (!isCronRequestAuthorized(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const job = jobFromSlug((await params).job);
  if (!job) return NextResponse.json({ error: "No such job." }, { status: 404 });

  const result = await runNamedJob(job, "SCHEDULER");
  return NextResponse.json(result, { status: result.status === "FAILED" ? 500 : 200 });
}

export { handle as GET, handle as POST };
