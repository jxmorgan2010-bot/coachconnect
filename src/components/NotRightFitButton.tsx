import Link from "next/link";
import { secondaryButtonClass, quietLinkClass } from "@/lib/ui";
import type { Sport } from "@/generated/prisma/client";

/**
 * Framed as a normal next step, not a breakup — routes straight to similar coaches in
 * the same sport/area rather than a generic search, and excludes this coach so they
 * don't show back up in the results.
 */
export default function NotRightFitButton({
  coachProfileId,
  sport,
  city,
  variant = "button",
}: {
  coachProfileId: string;
  sport?: Sport;
  city?: string | null;
  variant?: "button" | "quiet";
}) {
  const params = new URLSearchParams({ excludeCoachId: coachProfileId });
  if (sport) params.set("sport", sport);
  if (city) params.set("location", city);

  return (
    <Link
      href={`/coaches?${params.toString()}`}
      className={variant === "quiet" ? `${quietLinkClass} text-ink` : secondaryButtonClass}
    >
      {variant === "quiet" ? "Not the right fit? See similar coaches" : "This isn’t the right fit"}
    </Link>
  );
}
