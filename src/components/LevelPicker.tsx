import type { SkillLevel } from "@/generated/prisma/client";
import { SKILL_LEVELS, SKILL_LEVEL_LABELS, SKILL_LEVEL_DESCRIPTIONS } from "@/lib/skillLevels";

/**
 * Pick one level (a child's level in a sport). Every option carries its plain-English
 * description. When `accepted` is given (booking with a specific coach), levels the coach
 * doesn't take are marked, not hidden, so a parent sees where their kid stands either way.
 */
export default function LevelPicker({
  name,
  legend,
  value,
  onChange,
  accepted,
}: {
  name: string;
  legend: React.ReactNode;
  value: SkillLevel | null;
  onChange: (level: SkillLevel) => void;
  accepted?: readonly SkillLevel[];
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-bold text-ink">{legend}</legend>
      {SKILL_LEVELS.map((level) => {
        const notTaken = accepted && !accepted.includes(level);
        return (
          <label
            key={level}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border-2 border-line bg-surface px-3.5 py-2.5 hover:border-ink has-[:checked]:border-ink has-[:checked]:bg-muted"
          >
            <input
              type="radio"
              name={name}
              value={level}
              checked={value === level}
              onChange={() => onChange(level)}
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--pitch)]"
            />
            <span className="text-sm">
              <span className="font-bold text-ink">{SKILL_LEVEL_LABELS[level]}</span>
              {notTaken && <span className="ml-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Not taken by this coach</span>}
              <span className="block text-muted-foreground">{SKILL_LEVEL_DESCRIPTIONS[level]}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
