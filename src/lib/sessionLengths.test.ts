import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedLength, lengthLabel, lengthOptions, packageLengthOptions } from "./sessionLengths";
import { openSlotsForDate, type WeeklyWindow } from "./availability";

test("only 45, 60 and 75 minutes are allowed", () => {
  for (const ok of [45, 60, 75]) assert.equal(isAllowedLength(ok), true);
  for (const no of [0, 30, 50, 90, 120, 60.5]) assert.equal(isAllowedLength(no), false);
});

test("labels, including older lengths", () => {
  assert.equal(lengthLabel(45), "45 min");
  assert.equal(lengthLabel(60), "1 hour");
  assert.equal(lengthLabel(75), "1 hour 15 min");
  assert.equal(lengthLabel(90), "1 hour 30 min");
  assert.equal(lengthLabel(120), "2 hours");
  assert.equal(lengthLabel(30), "30 min");
});

test("each length is priced at rate × length", () => {
  assert.deepEqual(
    lengthOptions(5000).map((o) => [o.label, o.priceCents]),
    [["45 min", 3750], ["1 hour", 5000], ["1 hour 15 min", 6250]],
  );
  // A rate that doesn't divide evenly rounds to the nearest cent.
  assert.deepEqual(lengthOptions(4250).map((o) => o.priceCents), [3188, 4250, 5313]);
});

test("a package is 5 × the session price, 10% off", () => {
  const [p45, p60, p75] = packageLengthOptions(5000).map((o) => o.pricing);
  assert.equal(p45.totalChargedCents, Math.round(5 * 3750 * 0.9)); // 16875
  assert.equal(p60.totalChargedCents, 22500);
  assert.equal(p75.totalChargedCents, Math.round(5 * 6250 * 0.9)); // 28125
  assert.equal(p75.pricePerSessionCents, 6250);
});

// Wed 2026-10-14, coach posts 4:00–7:00 PM.
const WINDOWS: WeeklyWindow[] = [{ dayOfWeek: 3, startMinute: 16 * 60, endMinute: 19 * 60 }];
const EARLY = new Date("2026-01-01T00:00:00Z");
const labels = (slots: { label: string }[]) => slots.map((s) => s.label);

test("availability uses the chosen length: a 75-min session must end by the window's close", () => {
  const slots = openSlotsForDate({ date: "2026-10-14", windows: WINDOWS, busy: [], durationMinutes: 75, now: EARLY });
  assert.deepEqual(labels(slots), ["4:00 PM", "4:30 PM", "5:00 PM", "5:30 PM"]); // 5:30 + 75 = 6:45; 6:00 + 75 = 7:15
});

test("availability uses the chosen length next to an existing booking", () => {
  // A 45-minute session booked 4:00–4:45 PM PDT.
  const busy = [{ scheduledAt: new Date("2026-10-14T23:00:00Z"), durationMinutes: 45 }];
  const slots45 = openSlotsForDate({ date: "2026-10-14", windows: WINDOWS, busy, durationMinutes: 45, now: EARLY });
  assert.deepEqual(labels(slots45), ["5:00 PM", "5:30 PM", "6:00 PM"]);
  // 75 minutes has to start after 4:45 and end by 7:00.
  const slots75 = openSlotsForDate({ date: "2026-10-14", windows: WINDOWS, busy, durationMinutes: 75, now: EARLY });
  assert.deepEqual(labels(slots75), ["5:00 PM", "5:30 PM"]);
});
