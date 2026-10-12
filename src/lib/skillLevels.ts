import type { SkillLevel } from "@/generated/prisma/client";

/** Lowest to highest. Display order everywhere a level is listed or picked. */
export const SKILL_LEVELS: SkillLevel[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "COMPETITIVE"];

export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  COMPETITIVE: "Competitive",
};

/** Roster-board shorthand, to sit next to the sport tags (see SPORT_TAG). */
export const SKILL_LEVEL_TAG: Record<SkillLevel, string> = {
  BEGINNER: "BEG",
  INTERMEDIATE: "INT",
  ADVANCED: "ADV",
  COMPETITIVE: "COMP",
};

/** Shown wherever a level is picked, so parents and coaches mean the same thing by it. */
export const SKILL_LEVEL_DESCRIPTIONS: Record<SkillLevel, string> = {
  BEGINNER: "New to the sport or still learning the basics.",
  INTERMEDIATE: "Knows the basics and plays on a rec or school team.",
  ADVANCED: "Strong skills; plays on a club, travel, JV or varsity team.",
  COMPETITIVE: "Training for top club, varsity starter or college-recruiting level.",
};

export function isSkillLevel(value: string): value is SkillLevel {
  return (SKILL_LEVELS as string[]).includes(value);
}

/** The CoachSport column that records whether the coach takes this level. */
export const ACCEPTS_COLUMN = {
  BEGINNER: "acceptsBeginner",
  INTERMEDIATE: "acceptsIntermediate",
  ADVANCED: "acceptsAdvanced",
  COMPETITIVE: "acceptsCompetitive",
} as const satisfies Record<SkillLevel, string>;

export type CoachSportLevelFlags = {
  acceptsBeginner: boolean;
  acceptsIntermediate: boolean;
  acceptsAdvanced: boolean;
  acceptsCompetitive: boolean;
};

/** The levels a CoachSport row takes, lowest first. */
export function levelsFromFlags(flags: CoachSportLevelFlags): SkillLevel[] {
  return SKILL_LEVELS.filter((level) => flags[ACCEPTS_COLUMN[level]]);
}

/** CoachSport column values for a list of levels. */
export function flagsFromLevels(levels: readonly SkillLevel[]): CoachSportLevelFlags {
  return {
    acceptsBeginner: levels.includes("BEGINNER"),
    acceptsIntermediate: levels.includes("INTERMEDIATE"),
    acceptsAdvanced: levels.includes("ADVANCED"),
    acceptsCompetitive: levels.includes("COMPETITIVE"),
  };
}

/** Prisma `where` fragment for CoachSport rows that take this level. */
export function acceptsLevelWhere(level: SkillLevel) {
  return { [ACCEPTS_COLUMN[level]]: true } as Partial<CoachSportLevelFlags>;
}

/** "All levels" when a coach takes every level, otherwise e.g. "Intermediate, Advanced". */
export function describeLevels(levels: readonly SkillLevel[]): string {
  if (levels.length === SKILL_LEVELS.length) return "All levels";
  return SKILL_LEVELS.filter((l) => levels.includes(l)).map((l) => SKILL_LEVEL_LABELS[l]).join(", ");
}

/** "Intermediate and Advanced" / "Beginner, Intermediate and Advanced", for sentences. */
export function listLevels(levels: readonly SkillLevel[]): string {
  const labels = SKILL_LEVELS.filter((l) => levels.includes(l)).map((l) => SKILL_LEVEL_LABELS[l]);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}
