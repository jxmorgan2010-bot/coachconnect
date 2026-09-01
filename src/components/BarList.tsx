export default function BarList({
  items,
  formatValue = (v: number) => String(v),
}: {
  items: { label: string; value: number }[];
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-sm font-bold text-ink">{item.label}</span>
          <div className="h-4 flex-1 overflow-hidden rounded border-2 border-ink bg-muted">
            <div className="h-full bg-pitch" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
          <span className="w-20 shrink-0 text-right text-sm text-muted-foreground">{formatValue(item.value)}</span>
        </div>
      ))}
    </div>
  );
}
