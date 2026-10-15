import { languageList, type Accommodations } from "@/lib/accommodations";

/**
 * What a coach says about special-needs experience, languages, travel and equipment. Shown as
 * the coach's own words: no badges or check icons, because none of it is verified.
 */
export default function AccommodationsList({
  accommodations: a,
  firstName,
  city,
}: {
  accommodations: Accommodations;
  firstName: string;
  city: string | null;
}) {
  const languages = languageList(a);
  const rows: { label: string; value: string; note?: string | null }[] = [];

  if (a.specialNeedsExperience) {
    rows.push({ label: "Special needs", value: "Has coached kids with special needs or disabilities", note: a.specialNeedsNote });
  }
  if (languages.length > 0) rows.push({ label: "Languages", value: languages.join(", ") });
  if (a.travelRadiusMiles !== null) {
    rows.push({ label: "Travel", value: `Travels up to ${a.travelRadiusMiles} miles${city ? ` from ${city}` : ""}` });
  }
  if (a.bringsEquipment !== null) {
    rows.push({ label: "Equipment", value: a.bringsEquipment ? "Brings their own equipment" : "Doesn't bring equipment" });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Shared by {firstName}. CoachConnect hasn&apos;t verified these.</p>
      {rows.length > 0 && (
        <dl className="divide-y-2 divide-line rounded-lg border-2 border-line bg-surface">
          {rows.map((row) => (
            <div key={row.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4">
              <dt className="eyebrow text-muted-foreground">{row.label}</dt>
              <dd className="text-sm text-ink">
                <span className="font-bold">{row.value}</span>
                {row.note && <span className="mt-1 block whitespace-pre-line text-ink/85">{row.note}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {a.accommodationsNote && (
        <p className="max-w-prose whitespace-pre-line border-l-4 border-line pl-4 text-sm text-ink/85">{a.accommodationsNote}</p>
      )}
    </div>
  );
}
