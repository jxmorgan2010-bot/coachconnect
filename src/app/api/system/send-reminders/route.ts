import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { runReminderSweep } from "@/lib/reminders";

/**
 * Manually triggerable from the admin dashboard for demo/testing. In
 * production, point a real scheduler (e.g. Vercel Cron) at this route
 * every few minutes instead.
 */
export async function POST() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const result = await runReminderSweep();
  return NextResponse.json({ ok: true, ...result });
}
