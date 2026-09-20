import Link from "next/link";
import { secondaryButtonClass } from "@/lib/ui";
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
}: {
  coachProfileId: string;
  sport?: Sport;
  city?: string | null;
}) {
  const params = new URLSearchParams({ excludeCoachId: coachProfileId });
  if (sport) params.set("sport", sport);
  if (city) params.set("location", city);

  return (
    <Link href={`/coaches?${params.toString()}`} className={secondaryButtonClass}>
      This isn&apos;t the right fit
    </Link>
  );
}
