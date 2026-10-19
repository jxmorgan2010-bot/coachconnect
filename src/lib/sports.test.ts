import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SPORTS,
  SPORT_TAG,
  SPORT_COLOR,
  SPORT_LABELS,
  SPORT_GROUPS,
  ADULT_ONLY_SPORTS,
  isSportAllowedForCoach,
  isSport,
  sportsInGroup,
} from "./sports";

test("added sports are listed and recognised", () => {
  for (const sport of ["MARTIAL_ARTS", "BOXING", "WRESTLING", "GOLF", "VOLLEYBALL", "TRACK_AND_FIELD", "BADMINTON", "TABLE_TENNIS"]) {
    assert.ok(isSport(sport), sport);
  }
});

test("coaches under 18 can offer the five sports added after combat", () => {
  for (const sport of ["GOLF", "VOLLEYBALL", "TRACK_AND_FIELD", "BADMINTON", "TABLE_TENNIS"] as const) {
    assert.equal(isSportAllowedForCoach(sport, true), true, sport);
  }
});

test("home page groups: every sport in exactly one, in the agreed order", () => {
  const label = (group: (typeof SPORT_GROUPS)[number]["id"]) => sportsInGroup(group).map((s) => SPORT_LABELS[s]);
  assert.deepEqual(label("TEAM"), ["Basketball", "Soccer", "Football", "Lacrosse", "Baseball", "Softball", "Volleyball"]);
  assert.deepEqual(label("RACKET"), ["Tennis", "Pickleball", "Badminton", "Table Tennis"]);
  assert.deepEqual(label("INDIVIDUAL"), ["Golf", "Track & Field"]);
  assert.deepEqual(label("COMBAT"), ["Martial Arts", "Boxing", "Wrestling"]);
  assert.equal(SPORT_GROUPS.flatMap((g) => sportsInGroup(g.id)).length, SPORTS.length);
});

/** WCAG relative luminance of a #RRGGBB colour. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test("sport colours are unique and their text passes WCAG AA", () => {
  const bgs = SPORTS.map((s) => SPORT_COLOR[s].bg.toUpperCase());
  assert.equal(new Set(bgs).size, bgs.length);
  for (const sport of SPORTS) {
    const [a, b] = [luminance(SPORT_COLOR[sport].bg), luminance(SPORT_COLOR[sport].fg)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    assert.ok(ratio >= 4.5, `${sport}: ${ratio.toFixed(2)}:1`);
  }
});

test("roster tags are unique", () => {
  const tags = SPORTS.map((s) => SPORT_TAG[s]);
  assert.equal(new Set(tags).size, tags.length);
});

test("coaches under 18 can't offer adult-only sports; adults can offer every sport", () => {
  for (const sport of SPORTS) {
    assert.equal(isSportAllowedForCoach(sport, false), true, `adult: ${sport}`);
    assert.equal(isSportAllowedForCoach(sport, true), !ADULT_ONLY_SPORTS.includes(sport), `minor: ${sport}`);
  }
  assert.deepEqual([...ADULT_ONLY_SPORTS].sort(), ["BOXING", "MARTIAL_ARTS", "WRESTLING"]);
});
