import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildIcs,
  escapeText,
  eventLocation,
  eventTitle,
  foldLine,
  googleCalendarUrl,
  icsFileName,
  LOCATION_FALLBACK,
  outlookCalendarUrl,
  pacificStamp,
  type CalendarSession,
} from "./calendar";
import { hashFeedToken, newFeedToken, parseChildIds, parseFeedToken } from "./calendarFeed";

const base: CalendarSession = {
  id: "bk_123",
  sport: "BASKETBALL",
  // Tue 2026-11-10, 4:30 PM PST (UTC-8), one hour.
  scheduledAt: new Date("2026-11-11T00:30:00Z"),
  durationMinutes: 60,
  locationText: "Mitchell Park, court 2",
  status: "CONFIRMED",
  childFirstName: "Emma",
  coachName: "Paul Henderson",
  createdAt: new Date("2026-11-01T18:00:00Z"),
  cancelledAt: null,
};

/** Unfolds an .ics into its logical lines. */
const unfold = (ics: string) => ics.replace(/\r\n[ \t]/g, "").split("\r\n").filter(Boolean);
const prop = (ics: string, name: string) => unfold(ics).filter((l) => l.startsWith(name));

test("parent title: sport, coach first name, child first name", () => {
  assert.equal(eventTitle(base, "PARENT"), "Basketball with Coach Paul (Emma)");
});

test("coach title doesn't name the coach", () => {
  assert.equal(eventTitle(base, "COACH"), "Basketball with Emma (Assist Coaching)");
});

test("titles mark cancelled and awaiting-consent sessions", () => {
  assert.equal(eventTitle({ ...base, status: "CANCELLED" }, "PARENT"), "Cancelled: Basketball with Coach Paul (Emma)");
  assert.equal(eventTitle({ ...base, status: "PENDING_CONSENT" }, "PARENT"), "Basketball with Coach Paul (Emma) (awaiting consent)");
});

test("last names are dropped, even when typed into a first-name field", () => {
  const s = { ...base, childFirstName: "Emma Rodriguez" };
  const ics = buildIcs([s], { viewer: "PARENT" });
  assert.ok(!ics.includes("Rodriguez"));
  assert.ok(!ics.includes("Henderson"));
  assert.ok(!googleCalendarUrl(s, "PARENT").includes("Henderson"));
  assert.ok(!outlookCalendarUrl(s, "PARENT").includes("Henderson"));
});

test("a location with contact details is replaced", () => {
  assert.equal(eventLocation({ locationText: "Call me at 408-555-0199" }), LOCATION_FALLBACK);
  assert.equal(eventLocation({ locationText: "email paul@example.com for the gate code" }), LOCATION_FALLBACK);
  assert.equal(eventLocation({ locationText: "  Mitchell   Park " }), "Mitchell Park");
  const ics = buildIcs([{ ...base, locationText: "Text 408-555-0199" }], { viewer: "PARENT" });
  assert.ok(!ics.includes("555"));
});

test("no session without a child name breaks the title", () => {
  assert.equal(eventTitle({ ...base, childFirstName: null }, "PARENT"), "Basketball with Coach Paul");
  assert.equal(eventTitle({ ...base, childFirstName: null }, "COACH"), "Basketball with a family (Assist Coaching)");
});

test("Pacific wall-clock times on both sides of the March daylight-saving change", () => {
  // Sat Mar 7, 2026, 5:00 PM PST = 01:00Z Mar 8. Clocks spring forward Sun Mar 8 at 2 AM.
  assert.equal(pacificStamp(new Date("2026-03-08T01:00:00Z")), "20260307T170000");
  // Mon Mar 9, 2026, 5:00 PM PDT = 00:00Z Mar 10.
  assert.equal(pacificStamp(new Date("2026-03-10T00:00:00Z")), "20260309T170000");
});

test("Pacific wall-clock times on both sides of the November daylight-saving change", () => {
  // Sat Oct 31, 2026, 10:00 AM PDT = 17:00Z. Clocks fall back Sun Nov 1 at 2 AM.
  const before = { ...base, scheduledAt: new Date("2026-10-31T17:00:00Z") };
  // Sun Nov 1, 2026, 10:00 AM PST = 18:00Z.
  const after = { ...base, id: "bk_after", scheduledAt: new Date("2026-11-01T18:00:00Z") };
  const ics = buildIcs([before, after], { viewer: "PARENT" });
  assert.deepEqual(prop(ics, "DTSTART;"), [
    "DTSTART;TZID=America/Los_Angeles:20261031T100000",
    "DTSTART;TZID=America/Los_Angeles:20261101T100000",
  ]);
  assert.deepEqual(prop(ics, "DTEND;"), [
    "DTEND;TZID=America/Los_Angeles:20261031T110000",
    "DTEND;TZID=America/Los_Angeles:20261101T110000",
  ]);
  // Links use UTC, so they're right whatever timezone the calendar app is set to.
  assert.ok(googleCalendarUrl(after, "PARENT").includes("dates=20261101T180000Z%2F20261101T190000Z"));
  assert.ok(outlookCalendarUrl(after, "PARENT").includes("startdt=2026-11-01T18%3A00%3A00Z"));
});

test("the VTIMEZONE carries the US rules", () => {
  const ics = buildIcs([base], { viewer: "PARENT" });
  const lines = unfold(ics);
  assert.ok(lines.includes("TZID:America/Los_Angeles"));
  assert.ok(lines.includes("RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU"));
  assert.ok(lines.includes("RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU"));
});

test("RFC 5545 shape: CRLF endings, required properties, balanced blocks", () => {
  const ics = buildIcs([base, { ...base, id: "bk_2", status: "CANCELLED", cancelledAt: new Date("2026-11-05T00:00:00Z") }], {
    viewer: "PARENT",
    now: new Date("2026-11-08T12:00:00Z"),
  });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "no bare LF");
  const lines = unfold(ics);
  assert.equal(lines.filter((l) => l === "BEGIN:VEVENT").length, 2);
  assert.equal(lines.filter((l) => l === "END:VEVENT").length, 2);
  assert.deepEqual(prop(ics, "UID:"), ["UID:booking-bk_123@getassistcoaching.com", "UID:booking-bk_2@getassistcoaching.com"]);
  assert.deepEqual(prop(ics, "DTSTAMP:"), ["DTSTAMP:20261108T120000Z", "DTSTAMP:20261108T120000Z"]);
  assert.deepEqual(prop(ics, "STATUS:"), ["STATUS:CONFIRMED", "STATUS:CANCELLED"]);
  assert.deepEqual(prop(ics, "SEQUENCE:"), ["SEQUENCE:0", "SEQUENCE:1"]);
});

test("feed calendars carry a name and refresh hint; single files don't", () => {
  assert.ok(buildIcs([base], { viewer: "PARENT", feed: true }).includes("X-WR-CALNAME:Assist Coaching"));
  assert.ok(!buildIcs([base], { viewer: "PARENT" }).includes("X-WR-CALNAME"));
});

test("text values are escaped", () => {
  assert.equal(escapeText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
  const ics = buildIcs([base], { viewer: "PARENT" });
  assert.ok(unfold(ics).includes("LOCATION:Mitchell Park\\, court 2"));
});

test("long lines fold at 75 octets without splitting a character", () => {
  const long = "Parque de la Ciudad — cancha número 3, junto al estacionamiento del centro recreativo ⚽ ".repeat(3);
  const ics = buildIcs([{ ...base, locationText: long }], { viewer: "PARENT" });
  for (const physical of ics.split("\r\n")) {
    assert.ok(Buffer.byteLength(physical, "utf8") <= 75, `line too long: ${physical}`);
    assert.ok(!physical.includes("�"));
  }
  assert.ok(unfold(ics).includes(`LOCATION:${escapeText(long.trim())}`));
  assert.equal(foldLine("short"), "short");
});

test("the description links back to the booking", () => {
  const ics = buildIcs([base], { viewer: "PARENT" });
  assert.ok(unfold(ics).some((l) => l.startsWith("URL:") && l.endsWith("/dashboard/bookings#booking-bk_123")));
  const coach = buildIcs([base], { viewer: "COACH" });
  assert.ok(unfold(coach).some((l) => l.startsWith("URL:") && l.endsWith("/dashboard#booking-bk_123")));
});

test("file name uses the Pacific date", () => {
  // 4:30 PM PST on Nov 10 is already Nov 11 in UTC.
  assert.equal(icsFileName(base), "assist-coaching-basketball-2026-11-10.ics");
  assert.equal(icsFileName({ ...base, sport: "TRACK_AND_FIELD" }), "assist-coaching-track-and-field-2026-11-10.ics");
});

test("feed tokens: 43 url-safe characters, hashed, parsed with or without .ics", () => {
  const { token, tokenHash } = newFeedToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(tokenHash, hashFeedToken(token));
  assert.notEqual(tokenHash, token);
  assert.equal(parseFeedToken(`${token}.ics`), token);
  assert.equal(parseFeedToken(token), token);
  assert.equal(parseFeedToken("short.ics"), null);
  assert.equal(parseFeedToken("../../etc/passwd"), null);
});

test("child filter parses safely", () => {
  assert.equal(parseChildIds(null), null);
  assert.deepEqual(parseChildIds('["a","b"]'), ["a", "b"]);
  assert.equal(parseChildIds("not json"), null);
  assert.equal(parseChildIds("[1,2]"), null);
});
