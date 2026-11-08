import { test, before } from "node:test";
import assert from "node:assert/strict";
import { checkForContactInfo } from "./moderation";
import { renderText, type Email } from "./email";
import * as T from "./emails";
import type { CalendarSession } from "./calendar";

before(() => {
  process.env.SITE_URL = "https://getassistcoaching.com";
});

const LINK = /https?:\/\/\S+/g;
const at = new Date("2026-11-14T21:00:00.000Z"); // Sat Nov 14, 1:00 PM PT

const booking: T.BookingFacts = {
  coachName: "Priya Shah",
  parentName: "Jordan Lee",
  childFirstName: "Alex",
  sport: "TENNIS",
  scheduledAt: at,
  durationMinutes: 60,
  locationText: "Mitchell Park, Palo Alto",
  priceCents: 5000,
  discountCents: 0,
  packageSessionsLeft: null,
  hasCardHold: true,
  cardHoldDueAt: null,
};

const hold: T.HoldFacts = { coachName: "Priya Shah", childFirstName: "Alex", scheduledAt: at, amountCents: 5000 };

function all(): Email[] {
  const to = "delivered@resend.dev";
  return [
    T.passwordResetEmail({ to, name: "Jordan Lee", link: "https://getassistcoaching.com/reset-password/tok" }),
    T.passwordChangedEmail({ to, name: "Jordan Lee" }),
    T.bookingConfirmedParentEmail(to, booking),
    T.bookingConfirmedParentEmail(to, { ...booking, packageSessionsLeft: 3, hasCardHold: false }),
    T.bookingConfirmedParentEmail(to, { ...booking, discountCents: 5000, hasCardHold: false }),
    T.bookingNewCoachEmail(to, booking),
    T.parentCancelledParentEmail(to, { ...booking, outcome: "FREE", stripeOk: true }),
    T.parentCancelledParentEmail(to, { ...booking, outcome: "LATE", stripeOk: true }),
    T.parentCancelledCoachEmail(to, { ...booking, outcome: "LATE", stripeOk: true }),
    T.coachCancelledParentEmail(to, { ...booking, stripeOk: true }),
    T.platformCancelledParentEmail({ to, coachName: "Priya Shah", scheduledAt: at, moneyLine: "You won't be charged." }),
    T.noShowParentEmail({ to, coachName: "Priya Shah" }),
    T.noShowCoachEmail({ to, scheduledAt: at }),
    T.autoReleasedParentEmail({ to, coachName: "Priya Shah" }),
    T.autoReleasedCoachEmail({ to, scheduledAt: at }),
    ...(["PARENT", "COACH"] as const).flatMap((audience) =>
      (["TOMORROW", "SOON"] as const).map((kind) =>
        T.reminderEmail({ to, audience, kind, coachName: "Priya Shah", parentName: "Jordan Lee", childFirstName: "Alex", scheduledAt: at, locationText: "Mitchell Park, Palo Alto" }),
      ),
    ),
    T.refundIssuedEmail(to, { kind: "REFUND", amountCents: 2500, coachName: "Priya Shah", scheduledAt: at }),
    T.refundIssuedEmail(to, { kind: "LATE_CANCEL_WAIVER", amountCents: 5000, sessionsReturned: 0, creditReturnedCents: 1000, coachName: "Priya Shah", scheduledAt: at }),
    T.refundIssuedEmail(to, { kind: "PACKAGE_UNUSED", amountCents: 13680, sessions: 4, coachName: "Casey Nguyen" }),
    T.newMessageEmail({ to, senderName: "Priya Shah", threadId: "thread1" }),
    T.consentRequestEmail({ to, guardianName: "Dana Shah", coachName: "Riley Shah", link: "https://getassistcoaching.com/minor-consent/tok", ttlDays: 7 }),
    T.consentRecordedEmail({ to, signerName: "Dana Shah", coachName: "Riley Shah", revokeLink: "https://getassistcoaching.com/minor-consent/revoke/tok" }),
    T.consentWithdrawnGuardianEmail({ to, coachName: "Riley Shah", cancelledCount: 2 }),
    T.consentWithdrawnCoachEmail({ to }),
    T.coachAwaitingReviewEmail({ to, coachName: "Riley Shah" }),
    T.newReportEmail({ to, targetType: "MESSAGE" }),
    T.refundRequestEmail({ to, kind: "PACKAGE_UNUSED" }),
    T.refundRequestEmail({ to, kind: "NO_SHOW" }),
    T.refundRequestEmail({ to, kind: "PROBLEM_REPORT" }),
    T.bookingConfirmedParentEmail(to, { ...booking, hasCardHold: false, cardHoldDueAt: new Date("2026-11-12T21:00:00.000Z") }),
    T.holdFailedParentEmail({ ...hold, to, bookingId: "b1", fixBy: new Date("2026-11-14T09:00:00.000Z"), needsAuthentication: false }),
    T.holdFailedParentEmail({ ...hold, to, bookingId: "b1", fixBy: new Date("2026-11-14T09:00:00.000Z"), needsAuthentication: true }),
    T.holdNotFixedParentEmail({ ...hold, to, creditReturnedCents: 1000 }),
    T.holdNotFixedCoachEmail({ to, scheduledAt: at }),
    T.bookingNeedsAdminEmail({ to, flag: "HOLD_NOT_FIXED" }),
    T.bookingNeedsAdminEmail({ to, flag: "CHARGE_FAILED" }),
    T.withCalendar(T.bookingConfirmedParentEmail(to, booking), calendarSession, "PARENT"),
    T.withCalendar(T.bookingNewCoachEmail(to, booking), calendarSession, "COACH"),
  ];
}

const calendarSession: CalendarSession = {
  id: "bk1",
  sport: "TENNIS",
  scheduledAt: at,
  durationMinutes: 60,
  locationText: "Mitchell Park, Palo Alto",
  status: "CONFIRMED",
  childFirstName: "Alex",
  coachName: "Priya Shah",
  createdAt: new Date("2026-11-08T12:00:00.000Z"),
  cancelledAt: null,
};

// "Add to calendar" links in booking emails are the only links allowed off the site.
const CALENDAR_HOSTS = ["https://calendar.google.com/", "https://outlook.live.com/"];

test("every email passes the contact-info filter (ignoring our own links)", () => {
  for (const e of all()) {
    const r = checkForContactInfo(`${e.subject}\n${renderText(e)}`.replace(LINK, " "));
    assert.equal(r.flagged, false, `"${e.subject}" tripped the filter: ${r.categories.join(", ")}`);
  }
});

test("every link points at the site", () => {
  for (const e of all()) {
    for (const url of renderText(e).match(LINK) ?? []) {
      const calendarLink = !!e.attachments && CALENDAR_HOSTS.some((h) => url.startsWith(h));
      assert.ok(url.startsWith("https://getassistcoaching.com") || calendarLink, `${e.subject}: ${url}`);
    }
  }
});

test("contact details a person typed never reach an email", () => {
  const sneaky = {
    ...booking,
    coachName: "Priya text me 415-555-0123",
    parentName: "Jordan (insta: jlee)",
    childFirstName: "Alex@gmail.com",
    locationText: "my house, call 415 555 0123",
  };
  for (const e of [
    T.bookingConfirmedParentEmail("x@resend.dev", sneaky),
    T.bookingNewCoachEmail("x@resend.dev", sneaky),
    T.parentCancelledCoachEmail("x@resend.dev", { ...sneaky, outcome: "FREE", stripeOk: true }),
  ]) {
    const text = renderText(e);
    assert.ok(!/555|insta|gmail/i.test(text), `${e.subject} leaked: ${text}`);
    assert.equal(checkForContactInfo(text.replace(LINK, " ")).flagged, false);
  }
  const confirmed = renderText(T.bookingConfirmedParentEmail("x@resend.dev", sneaky));
  assert.ok(confirmed.includes("Where: the place in your booking"));
});

test("message alert: sender's first name and a link, never the message", () => {
  const e = T.newMessageEmail({ to: "x@resend.dev", senderName: "Priya Shah", threadId: "t_1" });
  assert.equal(e.subject, "New message from Priya");
  assert.deepEqual(e.paragraphs, ["You have a new message from Priya."]);
  assert.equal(e.button?.url, "https://getassistcoaching.com/messages/t_1");
});

test("booking confirmation states the hold and the cancellation policy", () => {
  const bookedAt = new Date("2026-11-10T18:00:00.000Z");
  const text = renderText(T.bookingConfirmedParentEmail("x@resend.dev", booking, bookedAt));
  assert.ok(text.includes("Alex's Tennis session with Priya Shah is booked for Nov 14, 1:00 PM PT (1 hour)."));
  assert.ok(text.includes("We've placed a hold of $50.00 on your card."));
  assert.ok(text.includes("Free cancellation until 11:59 PM PT on Fri, Nov 13. After that, you're charged the full price."));
  assert.ok(text.includes("If the coach cancels or doesn't show, you're never charged."));

  const pkg = renderText(T.bookingConfirmedParentEmail("x@resend.dev", { ...booking, packageSessionsLeft: 1, hasCardHold: false }, bookedAt));
  assert.ok(pkg.includes("This session is from your package, so there's no charge today. You have 1 session left."));
  assert.ok(pkg.includes("After that, the session counts as used from your package."));
});

test("a session booked after its free-cancel deadline never names a deadline in the past", () => {
  const sameDay = new Date("2026-11-14T16:00:00.000Z"); // 8 AM PT on the session's day
  const text = renderText(T.bookingConfirmedParentEmail("x@resend.dev", booking, sameDay));
  assert.ok(text.includes("This session is past the free-cancellation deadline. If you cancel it, you're charged the full price."));
  assert.ok(!text.includes("Free cancellation until"));
});

test("parent cancellation says exactly what was or wasn't charged", () => {
  const line = (o: Partial<T.ParentCancelFacts>) =>
    T.parentCancelMoneyLine({ ...booking, outcome: "FREE", stripeOk: true, ...o });
  assert.equal(line({}), "You weren't charged. The hold on your card has been released.");
  assert.equal(line({ stripeOk: false }), "You won't be charged. We're releasing the hold on your card.");
  assert.equal(line({ packageSessionsLeft: 2, hasCardHold: false }), "You weren't charged, and the session has gone back into your package.");
  assert.equal(
    line({ hasCardHold: false, discountCents: 5000 }),
    "You weren't charged, and the $50.00 of credit you used is back in your account.",
  );
  assert.equal(line({ outcome: "LATE" }), "It was after the free-cancellation deadline, so your card was charged the full price of $50.00.");
  assert.equal(
    line({ outcome: "LATE", discountCents: 1000 }),
    "It was after the free-cancellation deadline, so your card was charged the full price of $40.00.",
  );
  assert.equal(
    line({ outcome: "LATE", packageSessionsLeft: 2, hasCardHold: false }),
    "It was after the free-cancellation deadline, so the session counts as used from your package.",
  );
});

test("coach cancellation: the parent is never charged", () => {
  const text = renderText(T.coachCancelledParentEmail("x@resend.dev", { ...booking, stripeOk: true }));
  assert.ok(text.includes("You weren't charged. The hold on your card has been released."));
});

test("refund emails give the amount and what it was for, never the admin's reason", () => {
  const waiver = renderText(
    T.refundIssuedEmail("x@resend.dev", { kind: "LATE_CANCEL_WAIVER", amountCents: 0, sessionsReturned: 1, creditReturnedCents: 0, coachName: "Priya Shah", scheduledAt: at }),
  );
  assert.ok(waiver.includes("The session is back in your package."));
  const pkg = renderText(T.refundIssuedEmail("x@resend.dev", { kind: "PACKAGE_UNUSED", amountCents: 13680, sessions: 4, coachName: "Casey Nguyen" }));
  assert.ok(pkg.includes("We've refunded $136.80 to your card for 4 unused sessions in your package with Casey Nguyen."));
});

test("admin alerts carry no report text or personal details", () => {
  const report = renderText(T.newReportEmail({ to: "x@resend.dev", targetType: "COACH_PROFILE" }));
  assert.ok(report.includes("Someone reported a coach profile. The details are on the reports page."));
});

test("booked more than 2 days ahead: the confirmation says when the hold is placed", () => {
  const bookedAt = new Date("2026-11-01T18:00:00.000Z");
  const text = renderText(
    T.bookingConfirmedParentEmail("x@resend.dev", { ...booking, hasCardHold: false, cardHoldDueAt: new Date("2026-11-12T21:00:00.000Z") }, bookedAt),
  );
  assert.ok(text.includes("We've saved your card. On Nov 12, 1:00 PM PT, 2 days before the session, we'll place a hold of $50.00 on it."));
  assert.ok(!text.includes("We've placed a hold"));
  // The cancellation policy is unchanged.
  assert.ok(text.includes("Free cancellation until 11:59 PM PT on Fri, Nov 13. After that, you're charged the full price."));
});

test("cancelling before the 2-day hold: nothing to release, and it says so", () => {
  const facts = { ...booking, hasCardHold: false, cardHoldDueAt: new Date("2026-11-12T21:00:00.000Z") };
  assert.equal(
    T.parentCancelMoneyLine({ ...facts, outcome: "FREE", stripeOk: true }),
    "You weren't charged. No hold had been placed on your card yet.",
  );
  assert.equal(
    T.parentCancelMoneyLine({ ...facts, discountCents: 1000, outcome: "FREE", stripeOk: true }),
    "You weren't charged, and the $10.00 of credit you used is back in your account. No hold had been placed on your card yet.",
  );
  // A late cancel with no hold yet charges the saved card.
  assert.equal(
    T.parentCancelMoneyLine({ ...facts, outcome: "LATE", stripeOk: false }),
    "It was after the free-cancellation deadline, so the full price of $50.00 will be charged to your card.",
  );
  const coach = renderText(T.coachCancelledParentEmail("x@resend.dev", { ...facts, stripeOk: true }));
  assert.ok(coach.includes("You weren't charged. No hold had been placed on your card yet."));
});

test("a failed hold: one clear action and a deadline, with the update link", () => {
  const e = T.holdFailedParentEmail({ ...hold, to: "x@resend.dev", bookingId: "b_1", fixBy: new Date("2026-11-14T09:00:00.000Z"), needsAuthentication: false });
  const text = renderText(e);
  assert.ok(text.includes("We couldn't place the $50.00 hold for Alex's session with Priya Shah on Nov 14, 1:00 PM PT."));
  assert.ok(text.includes("Update your card by Nov 14, 1:00 AM PT, or the session will be cancelled."));
  assert.equal(e.button?.url, "https://getassistcoaching.com/dashboard/bookings/b_1/card");
  const cancelled = renderText(T.holdNotFixedParentEmail({ ...hold, to: "x@resend.dev", creditReturnedCents: 0 }));
  assert.ok(cancelled.includes("You weren't charged."));
});

test("booking emails carry the .ics file and the calendar links", () => {
  const e = T.withCalendar(T.bookingConfirmedParentEmail("x@resend.dev", booking), calendarSession, "PARENT");
  assert.equal(e.attachments?.length, 1);
  assert.equal(e.attachments![0].filename, "assist-coaching-tennis-2026-11-14.ics");
  assert.match(e.attachments![0].content, /^BEGIN:VCALENDAR\r\n/);
  assert.match(e.attachments![0].content, /SUMMARY:Tennis with Coach Priya \(Alex\)\r\n/);
  assert.ok(!e.attachments![0].content.includes("Shah"));
  const text = renderText(e);
  assert.match(text, /Google Calendar: https:\/\/calendar\.google\.com\//);
  assert.match(text, /Microsoft calendar: https:\/\/outlook\.live\.com\//);
  assert.ok(text.includes("open the attached .ics file"));
});
