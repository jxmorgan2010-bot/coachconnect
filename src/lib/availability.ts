/**
 * Which start times a coach can be booked at. Pure functions (no DB) so the same rules
 * run in the booking form's slot list and in every server path that creates a booking.
 *
 * Coaches post weekly hours as Pacific wall-clock times (all coaches are in the Bay Area).
 * Bookings are stored as UTC instants. Converting between the two goes through
 * America/Los_Angeles explicitly, so DST changes and the server's own timezone never
 * shift a slot.
 */

export const COACH_TIMEZONE = "America/Los_Angeles";
export const SLOT_STEP_MINUTES = 30;

/** Any booking that isn't cancelled holds its slot. Cancelling (or a no-show) reopens it. */
export const SLOT_HOLDING_STATUS_FILTER = { not: "CANCELLED" } as const;

export type WeeklyWindow = { dayOfWeek: number; startMinute: number; endMinute: number };
export type BusyRange = { scheduledAt: Date; durationMinutes: number };
export type OpenSlot = { minutes: number; startsAt: Date; label: string };

const pacificFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: COACH_TIMEZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** Pacific calendar date ("2026-10-14"), weekday (0 = Sunday) and minutes after midnight. */
export function toPacificParts(instant: Date): { date: string; dayOfWeek: number; minutes: number } {
  const parts = Object.fromEntries(pacificFormatter.formatToParts(instant).map((p) => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, dayOfWeek: weekdayOf(date), minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** Weekday of a calendar date, independent of any timezone. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Offset of Pacific time from UTC at an instant, in minutes (-420 in summer, -480 in winter). */
function pacificOffsetMinutes(instant: Date): number {
  const p = toPacificParts(instant);
  const [y, m, d] = p.date.split("-").map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, 0, p.minutes);
  return Math.round((wallAsUtc - Math.floor(instant.getTime() / 60000) * 60000) / 60000);
}

/**
 * The UTC instant for a Pacific wall-clock time. Returns null for times that don't exist
 * (the hour skipped when clocks spring forward). For the repeated hour in November the
 * first occurrence (daylight time) is used.
 */
export function pacificWallTimeToUtc(date: string, minutes: number): Date | null {
  // 24:00 (a window that runs to midnight) is 00:00 the next day.
  if (minutes >= 24 * 60) {
    date = pacificDateRange(date, Math.floor(minutes / (24 * 60)) + 1).at(-1)!;
    minutes %= 24 * 60;
  }
  const [y, m, d] = date.split("-").map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, 0, minutes);
  // Try the offsets in effect a few hours either side; whichever round-trips is right.
  const candidates = new Set([
    pacificOffsetMinutes(new Date(wallAsUtc - 12 * 3600_000)),
    pacificOffsetMinutes(new Date(wallAsUtc + 12 * 3600_000)),
  ]);
  const matches = [...candidates]
    .map((offset) => new Date(wallAsUtc - offset * 60000))
    .filter((instant) => {
      const p = toPacificParts(instant);
      return p.date === date && p.minutes === minutes;
    })
    .sort((a, b) => a.getTime() - b.getTime());
  return matches[0] ?? null;
}

/** Posted windows for one weekday, merged where they touch or overlap (9–12 + 12–3 = 9–3). */
export function mergedWindows(windows: WeeklyWindow[], dayOfWeek: number): [number, number][] {
  const sorted = windows
    .filter((w) => w.dayOfWeek === dayOfWeek && w.endMinute > w.startMinute)
    .map((w) => [Math.max(0, w.startMinute), Math.min(24 * 60, w.endMinute)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

function overlaps(startA: number, durA: number, startB: number, durB: number) {
  return startA < startB + durB * 60000 && startB < startA + durA * 60000;
}

export function formatSlotLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/**
 * Bookable start times on a Pacific calendar date: on the 30-minute grid, inside the
 * coach's posted hours for that weekday with the whole session fitting before the window
 * closes, strictly in the future, and not overlapping any slot-holding booking.
 */
export function openSlotsForDate({
  date,
  windows,
  busy,
  durationMinutes,
  now,
}: {
  date: string;
  windows: WeeklyWindow[];
  busy: BusyRange[];
  durationMinutes: number;
  now: Date;
}): OpenSlot[] {
  const slots: OpenSlot[] = [];
  for (const [winStart, winEnd] of mergedWindows(windows, weekdayOf(date))) {
    // The window's end as a real instant, so a session that crosses a DST change is
    // measured in actual minutes.
    const windowEnd = pacificWallTimeToUtc(date, winEnd) ?? pacificWallTimeToUtc(date, winEnd + 60);
    if (!windowEnd) continue;
    for (let m = Math.ceil(winStart / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES; m < winEnd; m += SLOT_STEP_MINUTES) {
      const startsAt = pacificWallTimeToUtc(date, m);
      if (!startsAt) continue; // skipped hour at spring-forward
      const start = startsAt.getTime();
      if (start + durationMinutes * 60000 > windowEnd.getTime()) break;
      if (start <= now.getTime()) continue;
      if (busy.some((b) => overlaps(start, durationMinutes, b.scheduledAt.getTime(), b.durationMinutes))) continue;
      slots.push({ minutes: m, startsAt, label: formatSlotLabel(m) });
    }
  }
  return slots;
}

export type SlotCheck =
  | { ok: true }
  | { ok: false; reason: "past" | "no_hours" | "outside_hours" | "conflict"; message: string };

/** Server-side gate used by every booking path. Mirrors openSlotsForDate exactly. */
export function checkSlot({
  scheduledAt,
  durationMinutes,
  windows,
  busy,
  now,
}: {
  scheduledAt: Date;
  durationMinutes: number;
  windows: WeeklyWindow[];
  busy: BusyRange[];
  now: Date;
}): SlotCheck {
  if (windows.length === 0) {
    return { ok: false, reason: "no_hours", message: "This coach hasn't posted hours yet, so they can't be booked." };
  }
  if (scheduledAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "past", message: "That time has already passed. Pick another time." };
  }
  const { date } = toPacificParts(scheduledAt);
  const same = (s: OpenSlot) => s.startsAt.getTime() === scheduledAt.getTime();
  if (!openSlotsForDate({ date, windows, busy: [], durationMinutes, now }).some(same)) {
    return {
      ok: false,
      reason: "outside_hours",
      message: "That time isn't within this coach's posted hours for the full session. Pick one of the open times.",
    };
  }
  if (!openSlotsForDate({ date, windows, busy, durationMinutes, now }).some(same)) {
    return { ok: false, reason: "conflict", message: "That time was just booked by someone else. Pick another time." };
  }
  return { ok: true };
}

/** Pacific calendar dates starting at `from`, `count` days long ("2026-10-14", …). */
export function pacificDateRange(from: string, count: number): string[] {
  const [y, m, d] = from.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
}
