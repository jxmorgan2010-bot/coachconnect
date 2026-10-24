import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canMarkComplete,
  canReportNoShow,
  formatPacificDateTime,
  formatPacificTime,
  noShowOpensAt,
  sessionEndsAt,
} from "./sessionTiming";

// Sat 2026-10-24, 4:30 PM PDT (UTC-7), one hour.
const session = { scheduledAt: new Date("2026-10-24T23:30:00Z"), durationMinutes: 60 };
const at = (iso: string) => new Date(iso);

test("mark complete opens exactly at the scheduled end", () => {
  assert.equal(sessionEndsAt(session).toISOString(), "2026-10-25T00:30:00.000Z");
  assert.equal(canMarkComplete(session, at("2026-10-24T23:00:00Z")), false); // before start
  assert.equal(canMarkComplete(session, at("2026-10-24T23:45:00Z")), false); // in progress
  assert.equal(canMarkComplete(session, at("2026-10-25T00:29:59Z")), false);
  assert.equal(canMarkComplete(session, at("2026-10-25T00:30:00Z")), true);
  assert.equal(canMarkComplete(session, at("2026-10-27T00:00:00Z")), true);
});

test("mark complete uses the booking's own length", () => {
  const short = { ...session, durationMinutes: 45 };
  assert.equal(canMarkComplete(short, at("2026-10-25T00:15:00Z")), true);
  const long = { ...session, durationMinutes: 75 };
  assert.equal(canMarkComplete(long, at("2026-10-25T00:30:00Z")), false);
  assert.equal(canMarkComplete(long, at("2026-10-25T00:45:00Z")), true);
});

test("no-show opens 15 minutes after the start", () => {
  assert.equal(noShowOpensAt(session).toISOString(), "2026-10-24T23:45:00.000Z");
  assert.equal(canReportNoShow(session, at("2026-10-24T23:30:00Z")), false);
  assert.equal(canReportNoShow(session, at("2026-10-24T23:44:59Z")), false);
  assert.equal(canReportNoShow(session, at("2026-10-24T23:45:00Z")), true);
});

test("times are shown in Pacific, in both daylight and standard time", () => {
  assert.equal(formatPacificTime(sessionEndsAt(session)), "5:30 PM PT");
  // Sat 2026-12-05, 9:00 AM PST (UTC-8).
  assert.equal(formatPacificTime(at("2026-12-05T17:00:00Z")), "9:00 AM PT");
  // 4:30 PM on Oct 24 in Pacific is already Oct 25 in UTC; the date must stay Oct 24.
  assert.equal(formatPacificDateTime(at("2026-10-25T00:30:00Z")), "Oct 24, 5:30 PM PT");
});

test("a session across the November clock change still ends an hour after it starts", () => {
  // Sun 2026-11-01: 1:30 AM PDT, then clocks fall back at 2:00 AM to 1:00 AM PST.
  const s = { scheduledAt: new Date("2026-11-01T08:30:00Z"), durationMinutes: 60 };
  assert.equal(sessionEndsAt(s).toISOString(), "2026-11-01T09:30:00.000Z");
  assert.equal(formatPacificTime(sessionEndsAt(s)), "1:30 AM PT");
});
