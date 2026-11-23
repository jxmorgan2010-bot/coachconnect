import type { Sport } from "@/generated/prisma/client";
import { SPORT_COLOR, SPORT_LABELS } from "@/lib/sports";

/** The sport's full name on its own roster color. */
export default function SportPill({ sport }: { sport: Sport }) {
  const color = SPORT_COLOR[sport];
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded border-2 border-ink px-1.5 py-0.5 font-display text-xs tracking-wide"
      style={{ background: color.bg, color: color.fg }}
    >
      {SPORT_LABELS[sport]}
    </span>
  );
}
