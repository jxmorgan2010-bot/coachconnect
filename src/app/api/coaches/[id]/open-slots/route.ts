import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import {
  openSlotsForDate,
  pacificDateRange,
  toPacificParts,
  COACH_TIMEZONE,
  SLOT_HOLDING_STATUS_FILTER,
} from "@/lib/availability";

const ALLOWED_DURATIONS = new Set([30, 60, 90, 120]);
const MAX_DAYS = 42;

/**
 * Open start times for a coach, computed with the exact rules the server enforces when a
 * booking is created (src/lib/availability.ts). The form shows only these, so a parent
 * can't pick a time the server would reject. Returns times only — never who booked what.
 *
 * GET ?duration=60&from=2026-10-14&days=28
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { id } = await params;
  const url = new URL(req.url);
  const duration = Number(url.searchParams.get("duration") ?? 60);
  if (!ALLOWED_DURATIONS.has(duration)) {
    return NextResponse.json({ error: "Invalid duration." }, { status: 400 });
  }
  const now = new Date();
  const today = toPacificParts(now).date;
  const fromParam = url.searchParams.get("from");
  const from = fromParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) && fromParam >= today ? fromParam : today;
  const days = Math.min(MAX_DAYS, Math.max(1, Number(url.searchParams.get("days") ?? 28) || 28));

  const [windows, busy] = await Promise.all([
    prisma.availability.findMany({
      where: { coachProfileId: id },
      select: { dayOfWeek: true, startMinute: true, endMinute: true },
    }),
    prisma.booking.findMany({
      where: { coachProfileId: id, status: SLOT_HOLDING_STATUS_FILTER, scheduledAt: { gte: new Date(now.getTime() - 24 * 3600_000) } },
      select: { scheduledAt: true, durationMinutes: true },
    }),
  ]);

  const range = pacificDateRange(from, days);
  const result = range
    .map((date) => ({
      date,
      slots: openSlotsForDate({ date, windows, busy, durationMinutes: duration, now }).map((s) => ({
        startsAt: s.startsAt.toISOString(),
        label: s.label,
      })),
    }))
    .filter((d) => d.slots.length > 0);

  return NextResponse.json({
    ok: true,
    timezone: COACH_TIMEZONE,
    hasHours: windows.length > 0,
    days: result,
    nextFrom: pacificDateRange(from, days + 1).at(-1),
  });
}
