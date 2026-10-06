import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkSlot,
  mergedWindows,
  openSlotsForDate,
  pacificWallTimeToUtc,
  toPacificParts,
  weekdayOf,
  type WeeklyWindow,
} from "./availability";

// 2026-10-14 is a Wednesday (3). Saturday 9am–12pm and Wednesday 4pm–7pm.
const WINDOWS: WeeklyWindow[] = [
  { dayOfWeek: 6, startMinute: 9 * 60, endMinute: 12 * 60 },
  { dayOfWeek: 3, startMinute: 16 * 60, endMinute: 19 * 60 },
];
const EARLY = new Date("2026-01-01T00:00:00Z"); // "now" well before every test date
const at = (iso: string) => new Date(iso);
const labels = (slots: { label: string }[]) => slots.map((s) => s.label);

test("Pacific conversion: summer (PDT, UTC-7) and winter (PST, UTC-8)", () => {
  assert.equal(pacificWallTimeToUtc("2026-07-15", 10 * 60)!.toISOString(), "2026-07-15T17:00:00.000Z");
  assert.equal(pacificWallTimeToUtc("2026-12-15", 10 * 60)!.toISOString(), "2026-12-15T18:00:00.000Z");
  assert.deepEqual(toPacificParts(at("2026-12-15T18:00:00Z")), { date: "2026-12-15", dayOfWeek: 2, minutes: 600 });
});

test("Pacific conversion: the skipped hour at spring-forward doesn't exist", () => {
  // 2026-03-08: 2:00–2:59 AM never happens.
  assert.equal(pacificWallTimeToUtc("2026-03-08", 2 * 60 + 30), null);
  assert.equal(pacificWallTimeToUtc("2026-03-08", 3 * 60)!.toISOString(), "2026-03-08T10:00:00.000Z");
});

test("Pacific conversion: the repeated hour at fall-back uses the first (daylight) one", () => {
  // 2026-11-01: 1:00–1:59 AM happens twice; 1:30 PDT = 08:30 UTC.
  assert.equal(pacificWallTimeToUtc("2026-11-01", 90)!.toISOString(), "2026-11-01T08:30:00.000Z");
});

test("Pacific conversion: a window running to midnight ends at the next day's 00:00", () => {
  assert.equal(pacificWallTimeToUtc("2026-10-14", 24 * 60)!.toISOString(), "2026-10-15T07:00:00.000Z");
});

test("weekday comes from the calendar date, not the server timezone", () => {
  assert.equal(weekdayOf("2026-10-14"), 3);
  assert.equal(weekdayOf("2026-10-17"), 6);
});

test("only offers times inside posted hours, on the 30-minute grid", () => {
  const slots = openSlotsForDate({ date: "2026-10-17", windows: WINDOWS, busy: [], durationMinutes: 60, now: EARLY });
  assert.deepEqual(labels(slots), ["9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM"]);
});

test("the whole session must fit before the window closes", () => {
  const ninety = openSlotsForDate({ date: "2026-10-17", windows: WINDOWS, busy: [], durationMinutes: 90, now: EARLY });
  assert.equal(labels(ninety).at(-1), "10:30 AM");
  const twoHours = openSlotsForDate({ date: "2026-10-17", windows: WINDOWS, busy: [], durationMinutes: 120, now: EARLY });
  assert.deepEqual(labels(twoHours), ["9:00 AM", "9:30 AM", "10:00 AM"]);
  const tooLong = openSlotsForDate({
    date: "2026-10-17",
    windows: [{ dayOfWeek: 6, startMinute: 600, endMinute: 630 }],
    busy: [],
    durationMinutes: 60,
    now: EARLY,
  });
  assert.deepEqual(tooLong, []);
});

test("days with no posted hours have no slots", () => {
  assert.deepEqual(openSlotsForDate({ date: "2026-10-15", windows: WINDOWS, busy: [], durationMinutes: 60, now: EARLY }), []);
  assert.deepEqual(openSlotsForDate({ date: "2026-10-17", windows: [], busy: [], durationMinutes: 60, now: EARLY }), []);
});

test("past times are never offered, including earlier today", () => {
  const now = at("2026-10-17T17:15:00Z"); // 10:15 AM Pacific on Saturday
  const slots = openSlotsForDate({ date: "2026-10-17", windows: WINDOWS, busy: [], durationMinutes: 60, now });
  assert.deepEqual(labels(slots), ["10:30 AM", "11:00 AM"]);
  const yesterday = openSlotsForDate({ date: "2026-10-10", windows: WINDOWS, busy: [], durationMinutes: 60, now });
  assert.deepEqual(yesterday, []);
});

test("a booked slot blocks every overlapping start for that date only; next week stays open", () => {
  const busy = [{ scheduledAt: pacificWallTimeToUtc("2026-10-17", 10 * 60)!, durationMinutes: 60 }];
  const sameDay = openSlotsForDate({ date: "2026-10-17", windows: WINDOWS, busy, durationMinutes: 60, now: EARLY });
  // 9:30 would run into 10:00; 10:00 and 10:30 overlap; 9:00 and 11:00 are clear.
  assert.deepEqual(labels(sameDay), ["9:00 AM", "11:00 AM"]);
  const nextWeek = openSlotsForDate({ date: "2026-10-24", windows: WINDOWS, busy, durationMinutes: 60, now: EARLY });
  assert.deepEqual(labels(nextWeek), ["9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM"]);
});

test("adjacent or overlapping posted windows merge, so a session can span them", () => {
  const windows: WeeklyWindow[] = [
    { dayOfWeek: 6, startMinute: 9 * 60, endMinute: 10 * 60 },
    { dayOfWeek: 6, startMinute: 10 * 60, endMinute: 11 * 60 },
    { dayOfWeek: 6, startMinute: 10 * 60 + 30, endMinute: 11 * 60 + 30 },
  ];
  assert.deepEqual(mergedWindows(windows, 6), [[540, 690]]);
  const slots = openSlotsForDate({ date: "2026-10-17", windows, busy: [], durationMinutes: 120, now: EARLY });
  assert.deepEqual(labels(slots), ["9:00 AM", "9:30 AM"]);
});

test("a window starting off the grid begins at the next half hour", () => {
  const slots = openSlotsForDate({
    date: "2026-10-17",
    windows: [{ dayOfWeek: 6, startMinute: 9 * 60 + 15, endMinute: 11 * 60 }],
    busy: [],
    durationMinutes: 60,
    now: EARLY,
  });
  assert.deepEqual(labels(slots), ["9:30 AM", "10:00 AM"]);
});

test("DST days: Sunday Mar 8 and Sunday Nov 1 still produce correct instants", () => {
  const w: WeeklyWindow[] = [{ dayOfWeek: 0, startMinute: 9 * 60, endMinute: 11 * 60 }];
  const march = openSlotsForDate({ date: "2026-03-08", windows: w, busy: [], durationMinutes: 60, now: EARLY });
  assert.equal(march[0].startsAt.toISOString(), "2026-03-08T16:00:00.000Z"); // 9am PDT
  const nov = openSlotsForDate({ date: "2026-11-01", windows: w, busy: [], durationMinutes: 60, now: EARLY });
  assert.equal(nov[0].startsAt.toISOString(), "2026-11-01T17:00:00.000Z"); // 9am PST
  // An overnight window spanning the skipped hour skips 2:00–2:59 rather than inventing it.
  const overnight = openSlotsForDate({
    date: "2026-03-08",
    windows: [{ dayOfWeek: 0, startMinute: 60, endMinute: 4 * 60 }],
    busy: [],
    durationMinutes: 30,
    now: EARLY,
  });
  assert.deepEqual(labels(overnight), ["1:00 AM", "1:30 AM", "3:00 AM", "3:30 AM"]);
});

test("checkSlot (server gate) agrees with the offered slots and explains why not", () => {
  const ok = checkSlot({
    scheduledAt: pacificWallTimeToUtc("2026-10-14", 17 * 60)!,
    durationMinutes: 60,
    windows: WINDOWS,
    busy: [],
    now: EARLY,
  });
  assert.deepEqual(ok, { ok: true });

  const reason = (scheduledAt: Date, durationMinutes = 60, busy: { scheduledAt: Date; durationMinutes: number }[] = [], windows = WINDOWS, now = EARLY) => {
    const r = checkSlot({ scheduledAt, durationMinutes, windows, busy, now });
    return r.ok ? "ok" : r.reason;
  };
  assert.equal(reason(pacificWallTimeToUtc("2026-10-14", 18 * 60 + 30)!), "outside_hours"); // ends 7:30, window closes 7:00
  assert.equal(reason(pacificWallTimeToUtc("2026-10-15", 17 * 60)!), "outside_hours"); // Thursday: no hours
  assert.equal(reason(pacificWallTimeToUtc("2026-10-14", 17 * 60 + 10)!), "outside_hours"); // off the grid
  assert.equal(reason(pacificWallTimeToUtc("2026-10-14", 17 * 60)!, 60, [], [], EARLY), "no_hours");
  assert.equal(reason(pacificWallTimeToUtc("2026-10-14", 17 * 60)!, 60, [], WINDOWS, at("2026-10-20T00:00:00Z")), "past");
  const busy = [{ scheduledAt: pacificWallTimeToUtc("2026-10-14", 17 * 60 + 30)!, durationMinutes: 30 }];
  assert.equal(reason(pacificWallTimeToUtc("2026-10-14", 17 * 60)!, 60, busy), "conflict");
  assert.equal(reason(pacificWallTimeToUtc("2026-10-14", 18 * 60)!, 60, busy), "ok");
});

test("results don't depend on the server's own timezone", () => {
  const original = process.env.TZ;
  try {
    for (const tz of ["UTC", "Asia/Tokyo", "America/New_York"]) {
      process.env.TZ = tz;
      const slots = openSlotsForDate({ date: "2026-10-17", windows: WINDOWS, busy: [], durationMinutes: 60, now: EARLY });
      assert.equal(slots[0].startsAt.toISOString(), "2026-10-17T16:00:00.000Z", `under TZ=${tz}`);
    }
  } finally {
    process.env.TZ = original;
  }
});
