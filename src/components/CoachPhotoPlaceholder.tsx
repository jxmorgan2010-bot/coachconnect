import type { Sport } from "@/generated/prisma/client";
import { SPORT_COLOR, SPORT_TAG } from "@/lib/sports";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

/**
 * Stand-in for a coach who hasn't uploaded a photo yet — styled like the back of a
 * trading card in their primary sport's color, never a silhouette or stock face.
 * Fills its (relatively positioned) parent.
 */
export default function CoachPhotoPlaceholder({
  name,
  sport,
  gradYear,
  size = "card",
}: {
  name: string;
  sport?: Sport;
  gradYear?: number | null;
  size?: "card" | "profile";
}) {
  const color = sport ? SPORT_COLOR[sport] : { bg: "var(--pitch)", fg: "#FFFFFF" };

  return (
    <div
      role="img"
      aria-label={`${name} hasn't added a photo yet`}
      className="texture-hatch absolute inset-0 flex items-center justify-center overflow-hidden"
      style={{ background: color.bg, color: color.fg }}
    >
      {/* Jersey lettering: outlined initials, like a number stitched on a back */}
      <span
        aria-hidden
        className="font-display text-7xl leading-none tracking-wide"
        style={{ WebkitTextStroke: `2px ${color.fg}`, color: "transparent" }}
      >
        {initials(name)}
      </span>
      {/* Corner labels only at profile size — on a card those corners hold the
          "Book again" pin and the recommended ribbon. */}
      {size === "profile" && sport && (
        <span aria-hidden className="eyebrow absolute left-3 top-3 opacity-80">
          {SPORT_TAG[sport]}
        </span>
      )}
      {size === "profile" && gradYear && (
        <span aria-hidden className="eyebrow absolute right-3 top-3 opacity-80">
          &apos;{String(gradYear).slice(-2)}
        </span>
      )}
    </div>
  );
}
