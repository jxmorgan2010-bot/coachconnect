import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accommodationsFromProfile,
  hasAnyAccommodations,
  languageList,
  parseLanguages,
  serializeLanguages,
} from "./accommodations";
import { accommodationsSchema } from "./validation";

const empty = {
  specialNeedsExperience: false,
  specialNeedsNote: null,
  languages: null,
  languagesOther: null,
  travelRadiusMiles: null,
  bringsEquipment: null,
  accommodationsNote: null,
};

test("an untouched profile has nothing to show", () => {
  const a = accommodationsFromProfile(empty);
  assert.equal(hasAnyAccommodations(a), false);
  assert.deepEqual(a.languages, []);
});

test("languages round-trip in list order, without duplicates or unknown codes", () => {
  assert.equal(serializeLanguages(["SPANISH", "ENGLISH", "SPANISH"]), '["ENGLISH","SPANISH"]');
  assert.equal(serializeLanguages([]), null);
  assert.deepEqual(parseLanguages('["ASL","KLINGON","ENGLISH"]'), ["ENGLISH", "ASL"]);
  assert.deepEqual(parseLanguages("not json"), []);
  assert.deepEqual(parseLanguages('{"ENGLISH":true}'), []);
});

test("the Other text is listed after the picked languages", () => {
  assert.deepEqual(languageList({ languages: ["MANDARIN"], languagesOther: "Farsi" }), ["Mandarin", "Farsi"]);
});

test("a special-needs note without the box ticked is dropped", () => {
  const a = accommodationsFromProfile({ ...empty, specialNeedsNote: "left over" });
  assert.equal(a.specialNeedsNote, null);
  const parsed = accommodationsSchema.parse({ ...empty, languages: [], specialNeedsNote: "stale" });
  assert.equal(parsed.specialNeedsNote, null);
});

test("saying no to equipment still counts as an answer worth showing", () => {
  assert.equal(hasAnyAccommodations(accommodationsFromProfile({ ...empty, bringsEquipment: false })), true);
});

test("a stored travel distance outside the options reads as not set", () => {
  assert.equal(accommodationsFromProfile({ ...empty, travelRadiusMiles: 15 }).travelRadiusMiles, null);
});

test("the schema accepts real answers and blanks empty text", () => {
  const parsed = accommodationsSchema.parse({
    specialNeedsExperience: true,
    specialNeedsNote: "  Unified soccer, two seasons  ",
    languages: ["ENGLISH", "SPANISH"],
    languagesOther: "   ",
    travelRadiusMiles: 10,
    bringsEquipment: true,
    accommodationsNote: "",
  });
  assert.equal(parsed.specialNeedsNote, "Unified soccer, two seasons");
  assert.equal(parsed.languagesOther, null);
  assert.equal(parsed.accommodationsNote, null);
  assert.equal(parsed.travelRadiusMiles, 10);
});

test("the schema rejects made-up languages, distances and over-long notes", () => {
  const base = { ...empty, languages: [] };
  assert.equal(accommodationsSchema.safeParse({ ...base, languages: ["KLINGON"] }).success, false);
  assert.equal(accommodationsSchema.safeParse({ ...base, travelRadiusMiles: 15 }).success, false);
  assert.equal(accommodationsSchema.safeParse({ ...base, accommodationsNote: "x".repeat(301) }).success, false);
  assert.equal(accommodationsSchema.safeParse({ ...base, languagesOther: "x".repeat(61) }).success, false);
});
