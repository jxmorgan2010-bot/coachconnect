import type { Sport } from "@/generated/prisma/client";
import { SPORT_TAG, SPORT_COLOR, SPORT_LABELS } from "@/lib/sports";

export default function SportPill({ sport }: { sport: Sport }) {
  const color = SPORT_COLOR[sport];
  return (
    <span
      title={SPORT_LABELS[sport]}
      className="inline-flex items-center rounded border-2 border-ink px-1.5 py-0.5 font-display text-xs tracking-wide"
      style={{ background: color.bg, color: color.fg }}
    >
      {SPORT_TAG[sport]}
    </span>
  );
}
