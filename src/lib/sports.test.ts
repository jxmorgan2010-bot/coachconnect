import { test } from "node:test";
import assert from "node:assert/strict";
import { SPORTS, SPORT_TAG, ADULT_ONLY_SPORTS, isSportAllowedForCoach, isSport } from "./sports";

test("combat sports are listed and recognised", () => {
  for (const sport of ["MARTIAL_ARTS", "BOXING", "WRESTLING"]) {
    assert.ok(isSport(sport), sport);
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
