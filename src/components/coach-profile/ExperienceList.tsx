import type { CoachProfile } from "@/generated/prisma/client";

export type CoachExperience = Pick<CoachProfile, "yearsCoaching" | "certifications" | "playingHistory">;

export function hasAnyExperience(e: CoachExperience): boolean {
  return e.yearsCoaching !== null || Boolean(e.certifications) || Boolean(e.playingHistory);
}

function yearsText(years: number): string {
  if (years === 0) return "Less than a year of coaching";
  return `${years} year${years === 1 ? "" : "s"} of coaching`;
}

/**
 * An experienced coach's own account of their coaching years, certifications and playing
 * history. Shown as the coach's words, like AccommodationsList: no badges or check icons,
 * because none of it is verified.
 */
export default function ExperienceList({ experience: e, firstName }: { experience: CoachExperience; firstName: string }) {
  const rows: { label: string; value: string }[] = [];
  if (e.yearsCoaching !== null) rows.push({ label: "Coaching", value: yearsText(e.yearsCoaching) });
  if (e.certifications) rows.push({ label: "Certifications", value: e.certifications });
  if (e.playingHistory) rows.push({ label: "Playing history", value: e.playingHistory });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Shared by {firstName}. Assist Coaching hasn&apos;t verified these.</p>
      <dl className="divide-y-2 divide-line rounded-lg border-2 border-line bg-surface">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4">
            <dt className="eyebrow text-muted-foreground">{row.label}</dt>
            <dd className="whitespace-pre-line text-sm text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
