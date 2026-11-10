import { test } from "node:test";
import assert from "node:assert/strict";
import { inCleanupHour, oldJobRunsWhere, shouldCleanUp, KEEP_FAILED_RUNS_DAYS, KEEP_RUNS_DAYS } from "./jobRunRetention";

const DAY = 24 * 60 * 60 * 1000;
const at = (iso: string) => new Date(iso);

test("cleanup hour is 3:00 to 3:59 AM Pacific, winter and summer", () => {
  assert.equal(inCleanupHour(at("2026-11-09T11:00:00Z")), true); // 3:00 PST
  assert.equal(inCleanupHour(at("2026-11-09T11:59:59Z")), true); // 3:59 PST
  assert.equal(inCleanupHour(at("2026-11-09T10:59:59Z")), false); // 2:59 PST
  assert.equal(inCleanupHour(at("2026-11-09T12:00:00Z")), false); // 4:00 PST
  assert.equal(inCleanupHour(at("2026-07-01T10:30:00Z")), true); // 3:30 PDT
  assert.equal(inCleanupHour(at("2026-07-01T11:30:00Z")), false); // 4:30 PDT
});

test("cleanup hour on the daylight-saving change days", () => {
  // Mar 8 2026: 2 AM PST jumps to 3 AM PDT.
  assert.equal(inCleanupHour(at("2026-03-08T09:59:00Z")), false); // 1:59 PST
  assert.equal(inCleanupHour(at("2026-03-08T10:00:00Z")), true); // 3:00 PDT
  assert.equal(inCleanupHour(at("2026-03-08T10:59:00Z")), true); // 3:59 PDT
  // Nov 1 2026: 2 AM PDT falls back to 1 AM PST; 3 AM happens once.
  assert.equal(inCleanupHour(at("2026-11-01T10:00:00Z")), false); // 2:00 PST
  assert.equal(inCleanupHour(at("2026-11-01T11:00:00Z")), true); // 3:00 PST
});

test("Run now always cleans up", () => {
  assert.equal(shouldCleanUp("ADMIN", at("2026-11-09T20:00:00Z"), []), true);
  assert.equal(shouldCleanUp("ADMIN", at("2026-11-09T11:10:00Z"), [at("2026-11-09T11:00:00Z")]), true);
});

test("a scheduled run cleans up only as the first scheduled run in the 3 AM hour", () => {
  const first = at("2026-11-09T11:00:20Z"); // 3:00 PST
  assert.equal(shouldCleanUp("SCHEDULER", first, [at("2026-11-09T10:45:20Z")]), true); // earlier run was 2:45
  assert.equal(shouldCleanUp("SCHEDULER", first, [first]), true); // its own row doesn't count
  assert.equal(shouldCleanUp("SCHEDULER", at("2026-11-09T11:15:20Z"), [at("2026-11-09T10:45:20Z"), first]), false);
  assert.equal(shouldCleanUp("SCHEDULER", at("2026-11-09T11:45:20Z"), [first]), false);
  assert.equal(shouldCleanUp("SCHEDULER", at("2026-11-09T12:00:20Z"), []), false); // 4:00, outside the hour
  assert.equal(shouldCleanUp("SCHEDULER", at("2026-11-09T20:00:00Z"), []), false); // midday
});

test("a scheduled run still cleans up if the schedule is every 30 minutes on :15 and :45", () => {
  assert.equal(shouldCleanUp("SCHEDULER", at("2026-11-09T11:15:00Z"), [at("2026-11-09T10:45:00Z")]), true);
  assert.equal(shouldCleanUp("SCHEDULER", at("2026-11-09T11:45:00Z"), [at("2026-11-09T11:15:00Z")]), false);
});

test("keep times: clean runs 30 days, runs with a failure 90 days", () => {
  assert.equal(KEEP_RUNS_DAYS, 30);
  assert.equal(KEEP_FAILED_RUNS_DAYS, 90);
  const now = at("2026-11-09T11:00:00Z");
  const where = oldJobRunsWhere(now);
  assert.deepEqual(where.OR[0], { startedAt: { lt: new Date(now.getTime() - 30 * DAY) }, status: "OK", failed: 0 });
  assert.deepEqual(where.OR[1], { startedAt: { lt: new Date(now.getTime() - 90 * DAY) } });
});
