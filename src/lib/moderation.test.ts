import { test } from "node:test";
import assert from "node:assert/strict";
import { checkForContactInfo, checkFields } from "./moderation";

const flagged = (text: string) => checkForContactInfo(text).flagged;

// Each row: text that must be blocked, and the category we expect it to trip.
const MUST_BLOCK: [string, string][] = [
  // phone numbers, any format
  ["call 415-555-0123 after practice", "phone"],
  ["my number (415) 555 0123", "phone"],
  ["4155550123", "phone"],
  ["+1 415 555 0123", "phone"],
  ["415.555.0123", "phone"],
  ["4 1 5 5 5 5 0 1 2 3", "phone"],
  ["four one five five five five zero one two three", "phone"],
  ["four 1 five 555 oh-one... 0123", "phone"],
  ["4l5 555 OI23", "phone"],
  ["4-1-5-5-5-5-0-1-2-3", "phone"],
  ["555 1234 ext 99 — 415", "phone"],
  ["4​1​5​5​5​5​0​1​2​3", "phone"],
  // emails, plain and obfuscated
  ["email me at sam.coach@gmail.com", "email"],
  ["sam at gmail dot com", "email"],
  ["sam (at) yahoo (dot) com", "email"],
  ["sam [at] outlook [dot] com", "email"],
  ["sam @ icloud . com", "email"],
  ["s a m @ g m a i l . c o m", "email"],
  ["it's my gmail, same as my name", "email"],
  // links and domains
  ["see www.samcoaches.com", "link"],
  ["https://example.org/booking", "link"],
  ["samcoaches.com has my rates", "link"],
  ["bit.ly/sam-rates", "link"],
  ["linktr.ee/samcoach", "platform"],
  // handles
  ["follow @sam_hoops", "handle"],
  ["I'm @coach.sam on there", "handle"],
  // other platforms, including spaced-out and lookalike spellings
  ["add me on instagram", "platform"],
  ["my insta is samhoops", "platform"],
  ["i n s t a g r a m", "platform"],
  ["what's app me", "platform"],
  ["whatsapp works", "platform"],
  ["Snapchat?", "platform"],
  ["add me on snap", "platform"],
  ["my snap is samhoops", "platform"],
  ["message me on telegram", "platform"],
  ["TikTok has my drills", "platform"],
  ["find me on fb", "platform"],
  ["Ínstagrám", "platform"],
  // off-platform payment
  ["just venmo me", "payment_app"],
  ["v e n m o is easier", "payment_app"],
  ["zelle works too", "payment_app"],
  ["cash app me $samhoops", "payment_app"],
  ["CashApp", "payment_app"],
  ["paypal or whatever", "payment_app"],
  ["pay pal", "payment_app"],
  ["send it to $samhoops", "payment_app"],
  // phrasing that moves things off the platform
  ["text me when you're there", "contact_phrase"],
  ["call me tonight", "contact_phrase"],
  ["DM me", "contact_phrase"],
  ["hit me up later", "contact_phrase"],
  ["my cell is the best way", "contact_phrase"],
  ["what's your phone number?", "contact_phrase"],
  ["let's talk outside the app", "contact_phrase"],
  ["we can do it off the platform", "contact_phrase"],
  ["you can pay me directly next time", "contact_phrase"],
  ["cash only please", "contact_phrase"],
  ["reach me at the usual", "contact_phrase"],
];

// Normal coaching conversation that must never be blocked.
const MUST_ALLOW = [
  "See you at 5:30 at Golden Gate Park",
  "Session is $45 for 60 minutes",
  "Package is $202.50 for 5 sessions",
  "Can we do 10/14/2026 at 9:00?",
  "Practice 2025-2026 season recap",
  "We covered 3 drills: 1-2 step, crossover, and layups",
  "Ages 8 10 12 14 are all welcome",
  "I cover 94110 94112 94114",
  "Meet at Mission Rec Center, court 2",
  "My number is 23 on the varsity team",
  "My number one goal is defense",
  "Work on my handle and footwork",
  "Call me Coach Sam",
  "Feel free to chime in",
  "Snap count drills for the QB",
  "Watch the hand signals from the bench",
  "Shoot from the free-throw line",
  "My phone died, running 5 min late",
  "Go to the park for practice at four",
  "We won 2 games for the first time",
  "ok.so tomorrow works",
  "Thanks.To be clear, 6pm is fine",
  "St. Mary's gym at 4pm",
  "Mt. Davidson trail run then drills",
  "meet @ the park at 4",
  "meet @the park",
  "see you @5pm",
  "We'll pay at booking through the app",
  "Sessions on 10/14, 10/21, 10/28",
  "Score was 21-14, 21-18",
  "Bring 2 water bottles and a ball",
  "Alex is in 5th grade, age 10",
  "Room 101 at Lowell High School",
  "Ran 4x400m splits: 62, 64, 63, 61",
  "",
];

for (const [text, category] of MUST_BLOCK) {
  test(`blocks: ${JSON.stringify(text)}`, () => {
    const result = checkForContactInfo(text);
    assert.equal(result.flagged, true, `expected ${JSON.stringify(text)} to be flagged`);
    assert.ok(
      result.categories.includes(category as never),
      `expected category ${category}, got ${result.categories.join(", ")}`,
    );
  });
}

for (const text of MUST_ALLOW) {
  test(`allows: ${JSON.stringify(text)}`, () => {
    const result = checkForContactInfo(text);
    assert.equal(result.flagged, false, `false positive (${result.categories.join(", ")}) on ${JSON.stringify(text)}`);
  });
}

test("checkFields flags if any one field has contact info, ignoring empty fields", () => {
  assert.equal(checkFields(["Great coach", null, undefined, ""]).flagged, false);
  assert.equal(checkFields(["Great coach", "venmo me"]).flagged, true);
});

test("checkForContactInfo never throws on odd input", () => {
  for (const s of ["   ", "@", "$", "...", "(at)", "1-2-3", "x".repeat(5000), "🏀🏀🏀"]) {
    assert.doesNotThrow(() => flagged(s));
  }
});
