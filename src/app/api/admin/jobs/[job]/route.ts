import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { jobFromSlug, runNamedJob } from "@/lib/jobs";

export const maxDuration = 60;

/** "Run now" on /admin/jobs: the same job the scheduler runs, logged with trigger ADMIN. */
export async function POST(_req: Request, { params }: { params: Promise<{ job: string }> }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const job = jobFromSlug((await params).job);
  if (!job) return NextResponse.json({ error: "No such job." }, { status: 404 });

  const result = await runNamedJob(job, "ADMIN");
  return NextResponse.json({ ok: result.status !== "FAILED", ...result });
}
