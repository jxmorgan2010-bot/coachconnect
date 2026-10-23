/**
 * Pick a session length, each option showing what it costs. Same look as LevelPicker: big
 * radio rows that are easy to hit on a phone. Used by the booking form, the package form
 * and quick rebook (when the earlier session's length can no longer be booked).
 */
export default function LengthPicker({
  name,
  legend,
  options,
  value,
  onChange,
  disabled = false,
}: {
  name: string;
  legend: React.ReactNode;
  options: { minutes: number; label: string; price: string; note?: string }[];
  value: number | null;
  onChange: (minutes: number) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1.5 text-sm font-bold text-ink">{legend}</legend>
      {options.map((o) => (
        <label
          key={o.minutes}
          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border-2 border-line bg-surface px-3.5 py-2.5 hover:border-ink has-[:checked]:border-ink has-[:checked]:bg-muted has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-70"
        >
          <input
            type="radio"
            name={name}
            value={o.minutes}
            checked={value === o.minutes}
            onChange={() => onChange(o.minutes)}
            className="h-4 w-4 shrink-0 accent-[var(--pitch)]"
          />
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className="font-bold text-ink">{o.label}</span>
            <span className="text-right">
              <span className="font-bold text-pitch">{o.price}</span>
              {o.note && <span className="block text-xs text-muted-foreground">{o.note}</span>}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
