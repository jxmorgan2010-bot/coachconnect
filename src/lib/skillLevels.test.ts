import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SKILL_LEVELS,
  SKILL_LEVEL_DESCRIPTIONS,
  levelsFromFlags,
  flagsFromLevels,
  acceptsLevelWhere,
  describeLevels,
  listLevels,
  isSkillLevel,
} from "./skillLevels";
import { coachProfileSchema, childLevelSchema } from "./validation";

test("every level has a description", () => {
  for (const level of SKILL_LEVELS) assert.ok(SKILL_LEVEL_DESCRIPTIONS[level].length > 10);
});

test("flags and levels round-trip, in level order", () => {
  assert.deepEqual(levelsFromFlags(flagsFromLevels(["COMPETITIVE", "INTERMEDIATE"])), ["INTERMEDIATE", "COMPETITIVE"]);
  assert.deepEqual(levelsFromFlags(flagsFromLevels(SKILL_LEVELS)), SKILL_LEVELS);
  assert.deepEqual(flagsFromLevels([]), {
    acceptsBeginner: false,
    acceptsIntermediate: false,
    acceptsAdvanced: false,
    acceptsCompetitive: false,
  });
});

test("acceptsLevelWhere targets the matching column", () => {
  assert.deepEqual(acceptsLevelWhere("ADVANCED"), { acceptsAdvanced: true });
});

test("describeLevels / listLevels wording", () => {
  assert.equal(describeLevels(SKILL_LEVELS), "All levels");
  assert.equal(describeLevels(["ADVANCED", "BEGINNER"]), "Beginner, Advanced");
  assert.equal(listLevels(["ADVANCED"]), "Advanced");
  assert.equal(listLevels(["COMPETITIVE", "ADVANCED"]), "Advanced and Competitive");
  assert.equal(listLevels(["BEGINNER", "INTERMEDIATE", "ADVANCED"]), "Beginner, Intermediate and Advanced");
});

test("isSkillLevel", () => {
  assert.equal(isSkillLevel("BEGINNER"), true);
  assert.equal(isSkillLevel("beginner"), false);
  assert.equal(isSkillLevel("child:abc"), false);
});

const profile = {
  bio: "I played four years of varsity soccer and coach younger kids every summer.",
  schoolLevel: "COLLEGE",
  schoolName: "SF State",
  gradYear: new Date().getFullYear() + 1,
  hourlyRateDollars: 40,
  city: "San Francisco",
  state: "CA",
  zip: "94103",
  sports: ["SOCCER"],
};

test("coach profile: every sport needs at least one level the coach picked", () => {
  // No levels sent no longer means every level.
  const none = coachProfileSchema.safeParse(profile);
  assert.equal(none.success, false);
  assert.match(none.error!.issues[0].message, /at least one level/);
  const partial = coachProfileSchema.safeParse({
    ...profile,
    sports: ["SOCCER", "TENNIS"],
    sportLevels: [{ sport: "SOCCER", levels: ["ADVANCED"] }],
  });
  assert.equal(partial.success, false);
  assert.equal(partial.error!.issues[0].message, "Pick at least one level for Tennis.");
  assert.equal(coachProfileSchema.safeParse({ ...profile, sportLevels: [{ sport: "SOCCER", levels: ["ADVANCED"] }] }).success, true);
  const empty = coachProfileSchema.safeParse({ ...profile, sportLevels: [{ sport: "SOCCER", levels: [] }] });
  assert.equal(empty.success, false);
  assert.match(empty.error!.issues[0].message, /at least one level/);
  assert.equal(coachProfileSchema.safeParse({ ...profile, sportLevels: [{ sport: "SOCCER", levels: ["PRO"] }] }).success, false);
});

test("child level schema", () => {
  assert.equal(childLevelSchema.safeParse({ sport: "TENNIS", level: "BEGINNER" }).success, true);
  assert.equal(childLevelSchema.safeParse({ sport: "TENNIS" }).success, false);
  assert.equal(childLevelSchema.safeParse({ sport: "CHESS", level: "BEGINNER" }).success, false);
});
