/**
 * Single-series ranked bars. One hue (pitch) because it's magnitude, not identity, so
 * there's no legend — the section title names the series. Values sit beside each bar as
 * text, which doubles as the accessible table view.
 */
export default function BarList({
  items,
  formatValue = (v: number) => String(v),
}: {
  items: { label: string; value: number }[];
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li
          key={item.label}
          className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]"
        >
          <span className="truncate text-sm font-bold text-ink" title={item.label}>
            {item.label}
          </span>
          {/* Track is recessive; the bar is square at the baseline, 4px round at the data end */}
          <span className="h-3 overflow-hidden rounded-r bg-muted" aria-hidden>
            <span
              className="block h-full rounded-r bg-pitch"
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
            />
          </span>
          <span className="min-w-14 text-right text-sm tabular-nums text-ink">{formatValue(item.value)}</span>
        </li>
      ))}
    </ul>
  );
}
