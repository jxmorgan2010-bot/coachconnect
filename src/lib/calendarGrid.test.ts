import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, addMonths, longDayLabel, monthGrid, monthLabel, startOfWeek, weekDates, weekLabel } from "./calendarGrid";

test("date arithmetic is unaffected by daylight saving", () => {
  assert.equal(addDays("2026-03-07", 1), "2026-03-08");
  assert.equal(addDays("2026-03-08", 1), "2026-03-09");
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-11-01", 1), "2026-11-02");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("months", () => {
  assert.equal(addMonths("2026-11-30", 1), "2026-12-01");
  assert.equal(addMonths("2026-01-31", -1), "2025-12-01");
  assert.equal(monthLabel("2026-11-08"), "November 2026");
});

test("month grids are whole Sunday-first weeks", () => {
  const nov = monthGrid("2026-11-15"); // Nov 1, 2026 is a Sunday
  assert.equal(nov[0][0], "2026-11-01");
  assert.equal(nov.length, 5);
  assert.equal(nov.at(-1)!.at(-1), "2026-12-05");
  const feb = monthGrid("2026-02-10"); // Feb 1, 2026 is a Sunday, 28 days
  assert.equal(feb.length, 4);
  const aug = monthGrid("2026-08-01"); // Aug 1, 2026 is a Saturday: 6 rows
  assert.equal(aug.length, 6);
  assert.equal(aug[0][0], "2026-07-26");
  for (const g of [nov, feb, aug]) for (const w of g) assert.equal(w.length, 7);
});

test("weeks", () => {
  assert.equal(startOfWeek("2026-11-08"), "2026-11-08");
  assert.equal(startOfWeek("2026-11-14"), "2026-11-08");
  assert.deepEqual(weekDates("2026-11-11"), [
    "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14",
  ]);
  assert.equal(weekLabel("2026-11-11"), "Nov 8 – 14, 2026");
  assert.equal(weekLabel("2026-12-01"), "Nov 29 – Dec 5, 2026");
  assert.equal(weekLabel("2026-12-31"), "Dec 27, 2026 – Jan 2, 2027");
  assert.equal(longDayLabel("2026-11-08"), "Sunday, November 8");
});
