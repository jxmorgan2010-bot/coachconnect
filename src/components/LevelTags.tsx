import type { SkillLevel } from "@/generated/prisma/client";
import { SKILL_LEVELS, SKILL_LEVEL_TAG, describeLevels } from "@/lib/skillLevels";

/**
 * The levels a coach takes in one sport, in roster shorthand ("INT · ADV"), or "All levels".
 * Screen readers get the full names.
 */
export default function LevelTags({
  levels,
  inheritColor = false,
}: {
  levels: readonly SkillLevel[];
  /** On colored bands (the profile header), use the band's text color instead of muted grey. */
  inheritColor?: boolean;
}) {
  const all = levels.length === SKILL_LEVELS.length;
  return (
    <span
      title={describeLevels(levels)}
      className={`text-xs font-bold tracking-wide ${inheritColor ? "" : "text-muted-foreground"}`}
    >
      <span aria-hidden="true">
        {all ? "ALL LEVELS" : SKILL_LEVELS.filter((l) => levels.includes(l)).map((l) => SKILL_LEVEL_TAG[l]).join(" · ")}
      </span>
      <span className="sr-only">{describeLevels(levels)}</span>
    </span>
  );
}
