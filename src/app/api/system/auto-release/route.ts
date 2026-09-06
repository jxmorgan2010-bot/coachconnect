import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { runAutoReleaseSweep } from "@/lib/autoRelease";

/**
 * Manually triggerable from the admin dashboard for demo/testing. In
 * production, point a real scheduler (e.g. Vercel Cron) at this route
 * every hour or so instead.
 */
export async function POST() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const result = await runAutoReleaseSweep();
  return NextResponse.json({ ok: true, ...result });
}
