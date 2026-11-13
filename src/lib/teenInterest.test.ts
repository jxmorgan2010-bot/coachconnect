import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCalendarDate, calendarDateToStoredDate, todayInPacific, formatCalendarDate, type CalendarDate } from "./age";
import {
  isTeenInterestAge,
  turns18OnFor,
  hasTurned18,
  csvField,
  teenInterestCsv,
  formatSports,
  parseSports,
  gradYearOptions,
} from "./teenInterest";
import { teenInterestSchema } from "./validation";
import { teenInterestConfirmationEmail } from "./emails";

const d = (s: string): CalendarDate => parseCalendarDate(s)!;
const TODAY = d("2026-11-12");

test("only 16- and 17-year-olds, and only while the Minor Coach tier is off", () => {
  assert.equal(isTeenInterestAge(d("2010-11-13"), TODAY, false), false); // 15, turns 16 tomorrow
  assert.equal(isTeenInterestAge(d("2010-11-12"), TODAY, false), true); // 16 today
  assert.equal(isTeenInterestAge(d("2008-11-13"), TODAY, false), true); // 17, turns 18 tomorrow
  assert.equal(isTeenInterestAge(d("2008-11-12"), TODAY, false), false); // 18 today
  assert.equal(isTeenInterestAge(d("2009-06-01"), TODAY, true), false); // tier on: real signup instead
});

test("turns18On follows the age rules, including Feb 29", () => {
  assert.deepEqual(turns18OnFor(d("2009-03-04")), d("2027-03-04"));
  assert.deepEqual(turns18OnFor(d("2008-02-29")), d("2026-03-01")); // 2026 has no Feb 29
});

test("hasTurned18 flips on the birthday itself", () => {
  const stored = calendarDateToStoredDate(d("2027-03-04"));
  assert.equal(hasTurned18(stored, d("2027-03-03")), false);
  assert.equal(hasTurned18(stored, d("2027-03-04")), true);
  assert.equal(hasTurned18(stored, d("2028-01-01")), true);
});

test("sports round-trip, dropping duplicates and unknown values", () => {
  assert.equal(formatSports(["SOCCER", "TENNIS", "SOCCER"]), "SOCCER,TENNIS");
  assert.deepEqual(parseSports("SOCCER,NOT_A_SPORT,TENNIS"), ["SOCCER", "TENNIS"]);
});

test("grad years run from last year to four years out", () => {
  assert.deepEqual(gradYearOptions(2026), [2025, 2026, 2027, 2028, 2029, 2030]);
});

test("csvField quotes when needed and neutralises spreadsheet formulas", () => {
  assert.equal(csvField("Lincoln High"), "Lincoln High");
  assert.equal(csvField('St. "Mary\'s", SF'), '"St. ""Mary\'s"", SF"');
  assert.equal(csvField("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvField("+1"), "'+1");
  assert.equal(csvField("@sum"), "'@sum");
  assert.equal(csvField(null), "");
  assert.equal(csvField(2027), "2027");
});

test("CSV has a header, one line per entry, and the now-18 column", () => {
  const row = {
    createdAt: new Date("2026-11-01T18:00:00Z"),
    firstName: "Maya",
    email: "maya@example.com",
    sports: "SOCCER,TENNIS",
    school: "Lowell, SF",
    gradYear: 2027,
    parentEmail: null,
    turns18On: calendarDateToStoredDate(d("2026-11-12")),
    contactedAt: null,
  };
  const lines = teenInterestCsv([row, { ...row, email: "b@example.com", turns18On: calendarDateToStoredDate(d("2027-05-01")), contactedAt: new Date("2026-11-10T12:00:00Z") }], TODAY)
    .trimEnd()
    .split("\r\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[0], "Joined,First name,Email,Sports,School,Grad year,Parent/guardian email,Turns 18,Now 18+,Contacted");
  assert.equal(lines[1], '2026-11-01,Maya,maya@example.com,"Soccer, Tennis","Lowell, SF",2027,,2026-11-12,yes,');
  assert.equal(lines[2], '2026-11-01,Maya,b@example.com,"Soccer, Tennis","Lowell, SF",2027,,2027-05-01,no,2026-11-10');
});

test("CSV joined/contacted dates are Pacific calendar dates", () => {
  const row = {
    createdAt: new Date("2026-11-13T05:00:00Z"), // 9 PM Nov 12 in Pacific
    firstName: "Maya",
    email: "m@example.com",
    sports: "SOCCER",
    school: "Lowell",
    gradYear: 2027,
    parentEmail: null,
    turns18On: calendarDateToStoredDate(d("2027-03-04")),
    contactedAt: new Date("2026-11-14T07:30:00Z"), // 11:30 PM Nov 13 in Pacific
  };
  const line = teenInterestCsv([row], TODAY).trimEnd().split("\r\n")[1];
  assert.equal(line, "2026-11-12,Maya,m@example.com,Soccer,Lowell,2027,,2027-03-04,no,2026-11-13");
});

test("CSV with no entries is just the header", () => {
  assert.equal(teenInterestCsv([], TODAY).split("\r\n").filter(Boolean).length, 1);
});

const valid = {
  firstName: " Maya ",
  email: "maya@example.com",
  dateOfBirth: "2009-03-04",
  sports: ["SOCCER"],
  school: "Lowell",
  gradYear: String(todayInPacific().year + 1),
  parentEmail: "",
};

test("schema: a blank parent email is none; trims names", () => {
  const r = teenInterestSchema.safeParse(valid);
  assert.ok(r.success);
  assert.equal(r.data.parentEmail, undefined);
  assert.equal(r.data.firstName, "Maya");
  assert.equal(r.data.gradYear, todayInPacific().year + 1);
});

test("schema: refuses no sports, unknown sports, bad grad year, bad parent email, future birth date", () => {
  assert.equal(teenInterestSchema.safeParse({ ...valid, sports: [] }).success, false);
  assert.equal(teenInterestSchema.safeParse({ ...valid, sports: ["CHESS"] }).success, false);
  assert.equal(teenInterestSchema.safeParse({ ...valid, gradYear: String(todayInPacific().year + 9) }).success, false);
  assert.equal(teenInterestSchema.safeParse({ ...valid, parentEmail: "not-an-email" }).success, false);
  const tomorrow = formatCalendarDate({ ...todayInPacific(), year: todayInPacific().year + 1 });
  assert.equal(teenInterestSchema.safeParse({ ...valid, dateOfBirth: tomorrow }).success, false);
});

test("confirmation email: to the teen only, with a removal button and no promised date", () => {
  const email = teenInterestConfirmationEmail({
    to: "maya@example.com",
    firstName: "Maya",
    turns18On: "March 4, 2027",
    removeLink: "https://example.test/teen-interest/remove/abc",
  });
  assert.equal(email.to, "maya@example.com");
  assert.equal(email.subject, "You're on the Assist Coaching interest list");
  assert.deepEqual(email.button, { label: "Remove me from the list", url: "https://example.test/teen-interest/remove/abc" });
  assert.match(email.paragraphs.join(" "), /when we can welcome younger coaches/);
  assert.match(email.paragraphs.join(" "), /March 4, 2027/);
  assert.equal(email.replaced, undefined);
});

test("confirmation email: a first name holding contact details falls back", () => {
  const email = teenInterestConfirmationEmail({ to: "a@example.com", firstName: "call 415-555-0100", turns18On: "May 1, 2027", removeLink: "https://x.test/r" });
  assert.equal(email.paragraphs[0], "Hi there,");
  assert.equal(email.replaced?.length, 1);
});
