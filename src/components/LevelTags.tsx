import type { SkillLevel } from "@/generated/prisma/client";
import { SKILL_LEVELS, SKILL_LEVEL_LABELS } from "@/lib/skillLevels";

/** The levels a coach takes in one sport, spelled out ("Intermediate · Advanced"), or "All levels". */
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
    <span className={`text-xs font-bold ${inheritColor ? "" : "text-muted-foreground"}`}>
      {all ? "All levels" : SKILL_LEVELS.filter((l) => levels.includes(l)).map((l) => SKILL_LEVEL_LABELS[l]).join(" · ")}
    </span>
  );
}
