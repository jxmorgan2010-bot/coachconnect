import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAverage, pluralize, reviewerName, summarizeReviews } from "./reviews";
import { bookingHistoryStatus, parsePage } from "./bookingHistory";

test("reviewers show as first name and last initial only", () => {
  assert.equal(reviewerName("Dana Rivera"), "Dana R.");
  assert.equal(reviewerName("  Mary Ann  van der berg "), "Mary B.");
  assert.equal(reviewerName("Cher"), "Cher");
  assert.equal(reviewerName("   "), "A parent");
});

test("no reviews means no average, never zero stars", () => {
  assert.deepEqual(summarizeReviews([]), { count: 0, average: null });
  assert.deepEqual(summarizeReviews([5]), { count: 1, average: 5 });
  assert.equal(formatAverage(summarizeReviews([5, 4, 4]).average!), "4.3");
  assert.equal(formatAverage(5), "5.0");
});

test("counts read naturally", () => {
  assert.equal(pluralize(1, "review"), "1 review");
  assert.equal(pluralize(0, "completed session"), "0 completed sessions");
});

test("booking history statuses", () => {
  const now = new Date("2026-10-14T12:00:00Z");
  const past = new Date("2026-10-13T12:00:00Z");
  const future = new Date("2026-10-15T12:00:00Z");
  assert.equal(bookingHistoryStatus("CONFIRMED", future, now).label, "Booked");
  assert.equal(bookingHistoryStatus("CONFIRMED", past, now).label, "Waiting for the parent to mark it complete");
  assert.equal(bookingHistoryStatus("COMPLETED", past, now).label, "Completed");
  assert.equal(bookingHistoryStatus("CANCELLED", future, now).label, "Cancelled");
  const cancelled = (cancelledBy: "PARENT" | "COACH", lateCancellation = false) =>
    bookingHistoryStatus("CANCELLED", future, now, { cancelledBy, lateCancellation }).label;
  assert.equal(cancelled("COACH"), "You cancelled");
  assert.equal(cancelled("PARENT"), "Family cancelled");
  assert.equal(cancelled("PARENT", true), "Family cancelled late · paid");
  assert.equal(bookingHistoryStatus("PENDING_CONSENT", future, now).label, "Pending");
});

test("page numbers fall back to 1", () => {
  assert.equal(parsePage(undefined), 1);
  assert.equal(parsePage("3"), 3);
  assert.equal(parsePage(["2", "5"]), 2);
  for (const bad of ["0", "-1", "1.5", "abc", ""]) assert.equal(parsePage(bad), 1);
});
