import { test, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { checkForContactInfo } from "./moderation";
import { renderText, sendEmail, type Email } from "./email";
import { cleanSentence, cleanText, makeEmailSafe, REMOVED } from "./emailSafety";
import * as T from "./emails";
import { SPORTS } from "./sports";
import { SESSION_LENGTHS } from "./sessionLengths";
import { pacificWallTimeToUtc } from "./availability";
import type { Sport } from "@/generated/prisma/client";
import type { CalendarSession } from "./calendar";

before(() => {
  process.env.SITE_URL = "https://getassistcoaching.com";
});

const LINK = /https?:\/\/\S+/g;
const flagged = (e: Email) => checkForContactInfo(`${e.subject}\n${renderText(e)}`.replace(LINK, " ")).flagged;

// ------------------------------------------------------------ finding the offending text

test("a clean piece of text is left alone", () => {
  assert.equal(cleanText("Alex's tennis session with Priya Shah is booked for Nov 14, 1:00 PM PT."), null);
});

test("only the matching word is replaced", () => {
  assert.equal(cleanText("Add it to your calendar: Google Calendar · Outlook"), `Add it to your calendar: Google Calendar · ${REMOVED}`);
});

test("two problems in one sentence are replaced separately, the rest stays", () => {
  const out = cleanSentence("Bring water, call me at 415-555-0123 and the gate code is on paul@gmail.com so we start on time");
  assert.ok(!checkForContactInfo(out).flagged, out);
  assert.ok(!out.includes("415") && !out.includes("paul@"), out);
  assert.ok(out.startsWith("Bring water,"), out);
  assert.ok(out.endsWith("so we start on time"), out);
});

test("spelled-out and spaced-out numbers are caught and removed", () => {
  const out = cleanText("Meet at the park. My number is four one five five five five zero one two three. See you there.");
  assert.ok(out && !checkForContactInfo(out).flagged, String(out));
  assert.ok(out!.startsWith("Meet at the park.") && out!.endsWith("See you there."), String(out));
});

test("only the flagged sentence of a paragraph changes", () => {
  const out = cleanText("Great session today. Venmo me after. Next week we work on footwork.");
  assert.equal(out, `Great session today. ${REMOVED} me after. Next week we work on footwork.`);
});

test("a match split across two paragraphs is caught by the whole-email check", () => {
  const email: Email = {
    to: "x@resend.dev",
    subject: "Session booked",
    paragraphs: ["Gate code 415 555", "0123 thanks, see you Saturday."],
    button: { label: "See your bookings", url: "https://getassistcoaching.com/dashboard/bookings" },
  };
  assert.ok(flagged(email), "precondition: the whole email trips the filter");
  const { email: safe, replacements } = makeEmailSafe(email, renderText);
  assert.ok(!flagged(safe));
  assert.equal(replacements.at(-1)?.part, "whole email");
  assert.equal(safe.subject, "Session booked");
  assert.equal(safe.button?.label, "See your bookings");
  assert.ok(safe.paragraphs.includes(REMOVED) && safe.paragraphs.length === 2);
});

test("replacements say which part, what matched, and what was sent", () => {
  const { email, replacements } = makeEmailSafe(
    { to: "x@resend.dev", subject: "Hi", paragraphs: ["Fine.", "Text me at 415-555-0123 tonight."], footnote: "Outlook too" },
    renderText,
  );
  assert.deepEqual(
    replacements.map((r) => r.part),
    ["paragraph 2", "footnote"],
  );
  assert.ok(replacements[0].categories.includes("phone"));
  assert.equal(replacements[0].originalText, "Text me at 415-555-0123 tonight.");
  assert.equal(email.paragraphs[0], "Fine.");
  assert.ok(!flagged(email));
});

// ------------------------------------------------------------ every template, realistic data

const NAMES = [
  "Priya Shah", "Marcus Lee", "Amara Johnson", "Diego Martinez", "Casey Nguyen", "Sofia Rossi",
  "Lynn Park", "Mark Cash", "Jordan Page", "Grace Line", "Sam Call", "Ben Signal", "Kim Chat",
  "Mary-Kate O'Brien", "José Álvarez", "Nguyễn Thị Lan", "Taylor Snap", "Will Text", "Joy Ring",
];
const KIDS = ["Alex", "Sam", "Emma", "Jordan", "Mia", "Noah", "Zoë", "Liam", null];
const PLACES = [
  "Mitchell Park, court 2", "Rinconada tennis courts", "Cubberley fields", "Greer Park diamond",
  "Palo Alto High School gym", "Los Altos Rec Center", "Mountain View Community Center, gym B",
  "Shoreline Athletic Fields #3", "Burgess Park pool deck", "YMCA, 3412 Ross Rd", "Baylands Park, field 4",
  "Cuesta Park tennis courts 1-4", "Peers Park (by the playground)", "Seale Park; meet at the bench",
];

function calendarSession(i: number, sport: Sport, at: Date, minutes: number): CalendarSession {
  return {
    id: `bk${i}`,
    sport,
    scheduledAt: at,
    durationMinutes: minutes,
    locationText: PLACES[i % PLACES.length],
    status: "CONFIRMED",
    childFirstName: KIDS[i % KIDS.length],
    coachName: NAMES[i % NAMES.length],
    createdAt: at,
    cancelledAt: null,
  };
}

/** Every email the app sends, for one set of values. */
function catalog(v: {
  coach: string;
  parent: string;
  kid: string | null;
  place: string;
  sport: Sport;
  at: Date;
  minutes: number;
  i: number;
}): [string, Email][] {
  const to = "delivered@resend.dev";
  const booking: T.BookingFacts = {
    coachName: v.coach,
    parentName: v.parent,
    childFirstName: v.kid,
    sport: v.sport,
    scheduledAt: v.at,
    durationMinutes: v.minutes,
    locationText: v.place,
    priceCents: 4500 + v.i * 125,
    discountCents: v.i % 3 === 0 ? 1000 : 0,
    packageSessionsLeft: v.i % 4 === 0 ? (v.i % 5) + 1 : null,
    hasCardHold: v.i % 4 !== 0,
    cardHoldDueAt: v.i % 2 === 0 ? new Date(v.at.getTime() - 2 * 86400_000) : null,
  };
  const hold: T.HoldFacts = { coachName: v.coach, childFirstName: v.kid, scheduledAt: v.at, amountCents: booking.priceCents };
  const cal = { ...calendarSession(v.i, v.sport, v.at, v.minutes), coachName: v.coach, childFirstName: v.kid, locationText: v.place };
  const fixBy = new Date(v.at.getTime() - 12 * 3600_000);
  return [
    ["password reset", T.passwordResetEmail({ to, name: v.parent, link: "https://getassistcoaching.com/reset-password/tok" })],
    ["password changed", T.passwordChangedEmail({ to, name: v.parent })],
    ["booking confirmed + calendar", T.withCalendar(T.bookingConfirmedParentEmail(to, booking), cal, "PARENT")],
    ["new booking (coach) + calendar", T.withCalendar(T.bookingNewCoachEmail(to, booking), cal, "COACH")],
    ["parent cancelled (free)", T.parentCancelledParentEmail(to, { ...booking, outcome: "FREE", stripeOk: true })],
    ["parent cancelled (late)", T.parentCancelledParentEmail(to, { ...booking, outcome: "LATE", stripeOk: v.i % 2 === 0 })],
    ["parent cancelled (coach copy)", T.parentCancelledCoachEmail(to, { ...booking, outcome: "LATE", stripeOk: true })],
    ["coach cancelled", T.coachCancelledParentEmail(to, { ...booking, stripeOk: true })],
    ["platform cancelled", T.platformCancelledParentEmail({ to, coachName: v.coach, scheduledAt: v.at, moneyLine: "You won't be charged." })],
    ["hold failed", T.holdFailedParentEmail({ ...hold, to, bookingId: "b1", fixBy, needsAuthentication: v.i % 2 === 0 })],
    ["hold not fixed (parent)", T.holdNotFixedParentEmail({ ...hold, to, creditReturnedCents: v.i % 2 ? 1000 : 0 })],
    ["hold not fixed (coach)", T.holdNotFixedCoachEmail({ to, scheduledAt: v.at })],
    ["no-show (parent)", T.noShowParentEmail({ to, coachName: v.coach })],
    ["no-show (coach)", T.noShowCoachEmail({ to, scheduledAt: v.at })],
    ["auto-released (parent)", T.autoReleasedParentEmail({ to, coachName: v.coach })],
    ["auto-released (coach)", T.autoReleasedCoachEmail({ to, scheduledAt: v.at })],
    ...(["PARENT", "COACH"] as const).flatMap((audience) =>
      (["TOMORROW", "SOON"] as const).map(
        (kind): [string, Email] => [
          `reminder ${audience} ${kind}`,
          T.reminderEmail({ to, audience, kind, coachName: v.coach, parentName: v.parent, childFirstName: v.kid, scheduledAt: v.at, locationText: v.place }),
        ],
      ),
    ),
    ["refund", T.refundIssuedEmail(to, { kind: "REFUND", amountCents: 2500, coachName: v.coach, scheduledAt: v.at })],
    ["late-cancel waiver", T.refundIssuedEmail(to, { kind: "LATE_CANCEL_WAIVER", amountCents: 5000, sessionsReturned: 1, creditReturnedCents: 1000, coachName: v.coach, scheduledAt: v.at })],
    ["package refund", T.refundIssuedEmail(to, { kind: "PACKAGE_UNUSED", amountCents: 13680, sessions: 4, coachName: v.coach })],
    ["new message", T.newMessageEmail({ to, senderName: v.coach, threadId: "thread1" })],
    ["consent request", T.consentRequestEmail({ to, guardianName: v.parent, coachName: v.coach, link: "https://getassistcoaching.com/minor-consent/tok", ttlDays: 7 })],
    ["consent recorded", T.consentRecordedEmail({ to, signerName: v.parent, coachName: v.coach, revokeLink: "https://getassistcoaching.com/minor-consent/revoke/tok" })],
    ["consent withdrawn (guardian)", T.consentWithdrawnGuardianEmail({ to, coachName: v.coach, cancelledCount: v.i % 3 })],
    ["consent withdrawn (coach)", T.consentWithdrawnCoachEmail({ to })],
    ["coach awaiting review", T.coachAwaitingReviewEmail({ to, coachName: v.coach })],
    ["needs admin", T.bookingNeedsAdminEmail({ to, flag: v.i % 2 ? "HOLD_NOT_FIXED" : "CHARGE_FAILED" })],
    ["new report", T.newReportEmail({ to, targetType: "MESSAGE" })],
    ["refund request", T.refundRequestEmail({ to, kind: (["PACKAGE_UNUSED", "NO_SHOW", "PROBLEM_REPORT"] as const)[v.i % 3] })],
  ];
}

test("every template with realistic data needs no replacements or fallbacks (every sport, a year of dates)", () => {
  const problems: string[] = [];
  let checked = 0;
  // One session a day through 2026 at a rotating time, cycling names, kids, places, sports, lengths.
  const times = ["06:30", "07:45", "09:00", "10:15", "11:30", "12:00", "13:45", "15:00", "16:30", "17:15", "18:45", "19:30"];
  for (let day = 0; day < 365; day++) {
    const date = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
    const [h, m] = times[day % times.length].split(":").map(Number);
    const at = pacificWallTimeToUtc(date, h * 60 + m)!;
    const v = {
      i: day,
      coach: NAMES[day % NAMES.length],
      parent: NAMES[(day * 7 + 3) % NAMES.length],
      kid: KIDS[day % KIDS.length],
      place: PLACES[day % PLACES.length],
      sport: SPORTS[day % SPORTS.length],
      at,
      minutes: SESSION_LENGTHS[day % SESSION_LENGTHS.length],
    };
    for (const [name, email] of catalog(v)) {
      checked++;
      const replacements = [...(email.replaced ?? []), ...makeEmailSafe(email, renderText).replacements];
      if (replacements.length) problems.push(`${name} on ${date} (${v.coach} / ${v.place}): ${replacements.map((r) => `${r.part}: ${r.originalText}`).join(" | ")}`);
    }
  }
  assert.deepEqual(problems.slice(0, 10), [], `${problems.length} of ${checked} emails needed replacements`);
});

// ------------------------------------------------------------ still sends, without the contact details

const NASTY = {
  coach: "Paul 415-555-0123",
  parent: "Dana dana.k@gmail.com",
  kid: "Alex (text me on Insta @alexhoops)",
  place: "Mitchell Park, text me at 415-555-0199 or venmo @coachpaul for the gate",
};
const LEAKS = ["415", "555", "0123", "0199", "gmail", "dana.k", "insta", "@alexhoops", "venmo", "@coachpaul"];

let sent: { subject: string; text: string; html: string }[] = [];
let realFetch: typeof fetch;
const savedEnv = { ...process.env };
beforeEach(() => {
  sent = [];
  realFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "re_test_dummy";
  process.env.EMAIL_FROM = "Assist Coaching <noreply@send.getassistcoaching.com>";
  // No database in unit tests: recording fails, is logged, and must not stop the email.
  delete process.env.DATABASE_URL;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ id: "email_1" }), { status: 200 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
});

test("every email type still sends when typed text has contact details, and none of it gets through", async () => {
  const at = new Date("2026-11-14T21:00:00.000Z");
  const emails = catalog({ ...NASTY, sport: "BASKETBALL", at, minutes: 60, i: 1 });
  for (const [name, email] of emails) {
    sent = [];
    const result = await sendEmail(email);
    assert.equal(result.status, "sent", `${name} wasn't sent`);
    assert.equal(sent.length, 1, name);
    const body = `${sent[0].subject}\n${sent[0].text}`.replace(LINK, " ").toLowerCase();
    for (const leak of LEAKS) assert.ok(!body.includes(leak), `${name} leaked "${leak}"`);
    assert.equal(sent[0].subject, email.subject, `${name}: subject changed`);
    const typed = email.replaced ?? [];
    // These use only a first name ("Dana", "Paul": clean) or no typed text at all.
    if (!["password reset", "new message", "password changed", "hold not fixed (coach)", "no-show (coach)", "auto-released (coach)", "consent withdrawn (coach)", "needs admin", "new report", "refund request"].includes(name)) {
      assert.ok(typed.length > 0, `${name}: the fallback wasn't noted for admins`);
    }
    for (const r of typed) assert.ok(r.categories.length > 0 && r.sentText.length > 0, name);
  }
});

test("password reset and booking emails keep their facts and their button", async () => {
  const at = new Date("2026-11-14T21:00:00.000Z");
  const booking: T.BookingFacts = {
    coachName: NASTY.coach, parentName: NASTY.parent, childFirstName: NASTY.kid, sport: "TENNIS", scheduledAt: at,
    durationMinutes: 60, locationText: NASTY.place, priceCents: 5000, discountCents: 0, packageSessionsLeft: null,
    hasCardHold: true, cardHoldDueAt: null,
  };
  await sendEmail(T.passwordResetEmail({ to: "x@resend.dev", name: NASTY.parent, link: "https://getassistcoaching.com/reset-password/tok123" }));
  assert.ok(sent[0].text.includes("https://getassistcoaching.com/reset-password/tok123"), "reset link kept");
  sent = [];
  await sendEmail(T.bookingConfirmedParentEmail("x@resend.dev", booking));
  assert.ok(sent[0].text.includes("Nov 14, 1:00 PM PT") && sent[0].text.includes("$50.00"), sent[0].text);
  assert.ok(sent[0].text.includes("See your bookings: https://getassistcoaching.com/dashboard/bookings"));
});

test("a template-level match is replaced, not dropped, and the rest of the email is untouched", async () => {
  const email: Email = {
    to: "x@resend.dev",
    subject: "Session booked with Priya",
    paragraphs: ["Alex's tennis session is booked for Nov 14, 1:00 PM PT.", "Add it to Outlook or Google Calendar."],
    button: { label: "See your bookings", url: "https://getassistcoaching.com/dashboard/bookings" },
  };
  const result = await sendEmail(email);
  assert.equal(result.status, "sent");
  assert.ok(sent[0].text.includes("Alex's tennis session is booked for Nov 14, 1:00 PM PT."));
  assert.ok(sent[0].text.includes(`Add it to ${REMOVED} or Google Calendar.`), sent[0].text);
  assert.equal(sent[0].subject, "Session booked with Priya");
});

test("fallbacks are noted once per typed value, with what matched and what was sent instead", () => {
  const e = T.bookingConfirmedParentEmail("x@resend.dev", {
    coachName: NASTY.coach, parentName: "Jordan Lee", childFirstName: "Alex", sport: "TENNIS",
    scheduledAt: new Date("2026-11-14T21:00:00.000Z"), durationMinutes: 60, locationText: NASTY.place,
    priceCents: 5000, discountCents: 0, packageSessionsLeft: null, hasCardHold: true, cardHoldDueAt: null,
  });
  const typed = e.replaced ?? [];
  assert.deepEqual(typed.map((r) => r.originalText).sort(), [NASTY.place, NASTY.coach].sort());
  assert.equal(typed.find((r) => r.originalText === NASTY.place)?.sentText, "the place in your booking");
  assert.ok(typed.find((r) => r.originalText === NASTY.coach)?.categories.includes("phone"));
  // A clean email notes nothing, and calls outside a template note nothing.
  assert.equal(T.passwordChangedEmail({ to: "x@resend.dev", name: "Jordan Lee" }).replaced, undefined);
});

test("typed text an email doesn't show isn't recorded (the day-before reminder has no location)", () => {
  const base = {
    to: "x@resend.dev", audience: "PARENT" as const, coachName: "Priya Shah", parentName: "Jordan Lee",
    childFirstName: "Alex", scheduledAt: new Date("2026-11-14T21:00:00.000Z"), locationText: NASTY.place,
  };
  assert.equal(T.reminderEmail({ ...base, kind: "TOMORROW" }).replaced, undefined);
  assert.equal(T.reminderEmail({ ...base, kind: "SOON" }).replaced?.[0]?.originalText, NASTY.place);
});
