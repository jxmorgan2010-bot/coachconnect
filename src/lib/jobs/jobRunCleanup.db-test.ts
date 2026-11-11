/**
 * Database tests for the daily JobRun cleanup. They delete every JobRun row first, so they refuse
 * to run unless pointed at a scratch database copy:
 *
 *   DATABASE_URL=file:/path/to/scratch-copy.db JOBRUN_DB_TEST=1 \
 *   npx tsx --test src/lib/jobs/jobRunCleanup.db-test.ts
 *
 * The scratch copy needs prisma/sql/2026-11-02-scheduler.sql applied first. No RESEND_API_KEY is
 * set, so a reminder that happens to be due is only logged, never sent.
 * Not matched by `npm test` (*.test.ts), so the normal suite never touches a database.
 */
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

const url = process.env.DATABASE_URL ?? "";
if (process.env.JOBRUN_DB_TEST !== "1" || !url.startsWith("file:") || /(^|[\\/:])dev\.db$/.test(url)) {
  throw new Error("Refusing to run: set JOBRUN_DB_TEST=1 and point DATABASE_URL at a scratch copy (not dev.db).");
}
if (process.env.RESEND_API_KEY) throw new Error("Refusing to run with RESEND_API_KEY set: these tests must not send email.");

import { prisma } from "../prisma";
import { JobLog } from "./runLog";
import { cleanUpJobRuns, deleteOldJobRuns } from "./jobRunCleanup";
import { CLEANUP_LABEL } from "./jobRunRetention";
import { runNamedJob } from "./index";

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const NOW = new Date("2026-11-09T11:05:00Z"); // 3:05 AM Pacific

type Row = { name: string; ageMs: number; status: string; failed?: number; job?: string; trigger?: string };
const days = (n: number) => n * DAY;

async function seed(rows: Row[], now = NOW) {
  for (const r of rows) {
    const startedAt = new Date(now.getTime() - r.ageMs);
    await prisma.jobRun.create({
      data: {
        id: `test-${r.name}`,
        job: r.job ?? "CARD_HOLDS",
        trigger: r.trigger ?? "SCHEDULER",
        startedAt,
        finishedAt: r.status === "RUNNING" ? null : new Date(startedAt.getTime() + 1000),
        status: r.status,
        succeeded: 0,
        failed: r.failed ?? (r.status === "OK" || r.status === "RUNNING" ? 0 : 1),
        summary: r.status === "RUNNING" ? null : "Nothing due.",
      },
    });
  }
}

const remaining = async () => (await prisma.jobRun.findMany({ select: { id: true } })).map((r) => r.id).sort();

beforeEach(async () => {
  await prisma.jobRun.deleteMany();
});

test("clean runs go after 30 days; runs with a failure, or that never finished, after 90", async () => {
  await seed([
    { name: "ok-29", ageMs: days(29), status: "OK" },
    { name: "ok-31", ageMs: days(31), status: "OK" },
    { name: "ok-failed-31", ageMs: days(31), status: "OK", failed: 2 },
    { name: "partial-31", ageMs: days(31), status: "PARTIAL" },
    { name: "failed-31", ageMs: days(31), status: "FAILED" },
    { name: "running-31", ageMs: days(31), status: "RUNNING" },
    { name: "failed-89", ageMs: days(89), status: "FAILED" },
    { name: "partial-91", ageMs: days(91), status: "PARTIAL" },
    { name: "failed-91", ageMs: days(91), status: "FAILED" },
    { name: "running-91", ageMs: days(91), status: "RUNNING" },
    { name: "ok-91", ageMs: days(91), status: "OK" },
  ]);
  assert.equal(await deleteOldJobRuns(NOW), 5);
  assert.deepEqual(await remaining(), [
    "test-failed-31",
    "test-failed-89",
    "test-ok-29",
    "test-ok-failed-31",
    "test-partial-31",
    "test-running-31",
  ]);
});

test("exactly 30 or 90 days old is kept (only older is deleted)", async () => {
  await seed([
    { name: "ok-30", ageMs: days(30), status: "OK" },
    { name: "failed-90", ageMs: days(90), status: "FAILED" },
  ]);
  assert.equal(await deleteOldJobRuns(NOW), 0);
  assert.deepEqual(await remaining(), ["test-failed-90", "test-ok-30"]);
});

test("first scheduled run at 3 AM cleans up and puts the count in the summary", async () => {
  await seed([
    { name: "ok-31", ageMs: days(31), status: "OK" },
    { name: "ok-40", ageMs: days(40), status: "OK", job: "REMINDERS" },
    { name: "ok-2", ageMs: days(2), status: "OK" },
  ]);
  const log = new JobLog();
  await cleanUpJobRuns(log, NOW, "SCHEDULER");
  assert.deepEqual(log.counts, { [CLEANUP_LABEL]: 2 });
  assert.equal(log.failed, 0);
  assert.equal(log.succeeded, 0);
  assert.deepEqual(await remaining(), ["test-ok-2"]);
});

test("a later scheduled run in the same 3 AM hour doesn't clean up again", async () => {
  await seed([
    { name: "ok-31", ageMs: days(31), status: "OK" },
    { name: "reminders-3am", ageMs: 5 * MIN, status: "OK", job: "REMINDERS" }, // 3:00 AM today
  ]);
  const log = new JobLog();
  await cleanUpJobRuns(log, NOW, "SCHEDULER");
  assert.deepEqual(log.counts, {});
  assert.deepEqual(await remaining(), ["test-ok-31", "test-reminders-3am"]);
});

test("a Run now earlier in the hour doesn't stop the scheduled 3 AM cleanup", async () => {
  await seed([
    { name: "ok-31", ageMs: days(31), status: "OK" },
    { name: "admin-3am", ageMs: 5 * MIN, status: "OK", job: "REMINDERS", trigger: "ADMIN" },
  ]);
  const log = new JobLog();
  await cleanUpJobRuns(log, NOW, "SCHEDULER");
  assert.deepEqual(log.counts, { [CLEANUP_LABEL]: 1 });
});

test("scheduled runs outside 3 AM leave old runs alone", async () => {
  await seed([{ name: "ok-31", ageMs: days(31), status: "OK" }]);
  const log = new JobLog();
  await cleanUpJobRuns(log, new Date("2026-11-09T20:05:00Z"), "SCHEDULER"); // 12:05 PM Pacific
  assert.deepEqual(log.counts, {});
  assert.deepEqual(await remaining(), ["test-ok-31"]);
});

test("nothing old: no count added, so a quiet run stays quiet", async () => {
  await seed([{ name: "ok-1", ageMs: days(1), status: "OK" }]);
  const log = new JobLog();
  await cleanUpJobRuns(log, NOW, "ADMIN");
  assert.deepEqual(log.counts, {});
  assert.equal(log.failed, 0);
});

test("a cleanup error is recorded as a failure of the run, not thrown", async () => {
  const delegate = prisma.jobRun as unknown as { deleteMany: (...a: unknown[]) => unknown };
  const original = delegate.deleteMany;
  const originalError = console.error;
  console.error = () => {};
  delegate.deleteMany = async () => {
    throw new Error("SQLITE_BUSY: database is locked");
  };
  try {
    const log = new JobLog();
    await cleanUpJobRuns(log, NOW, "ADMIN");
    assert.equal(log.failed, 1);
    assert.deepEqual(log.failures, ["cleanup: SQLITE_BUSY: database is locked"]);
    assert.deepEqual(log.counts, {});
  } finally {
    delegate.deleteMany = original;
    console.error = originalError;
  }
});

test("Run reminders now: cleans up and the run's summary shows the count", async () => {
  const now = new Date();
  await seed(
    [
      { name: "ok-31", ageMs: days(31), status: "OK" },
      { name: "ok-35", ageMs: days(35), status: "OK", job: "AUTO_RELEASE" },
      { name: "failed-31", ageMs: days(31), status: "FAILED" },
    ],
    now,
  );

  // The payment jobs (card holds, auto-release) aren't run here: they'd reach for Stripe. Only
  // REMINDERS is wired to cleanUpJobRuns in jobs/index.ts.
  const reminders = await runNamedJob("REMINDERS", "ADMIN");
  assert.match(reminders.summary, new RegExp(`${CLEANUP_LABEL}: 2(,|$)`));
  assert.equal(reminders.failed, 0);
  const row = await prisma.jobRun.findFirst({ where: { job: "REMINDERS" }, orderBy: { startedAt: "desc" } });
  assert.equal(row?.summary, reminders.summary);
  assert.equal(row?.status, "OK");
  assert.deepEqual((await remaining()).filter((id) => id.startsWith("test-")), ["test-failed-31"]);
});
