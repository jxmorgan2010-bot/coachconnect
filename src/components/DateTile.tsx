/** Calendar-tile date stamp used on session lists: short month over a big day number. */
export default function DateTile({ date, muted = false }: { date: Date; muted?: boolean }) {
  return (
    <div
      className={`flex w-14 shrink-0 flex-col items-center overflow-hidden rounded-lg border-2 border-ink text-center ${
        muted ? "bg-muted text-muted-foreground" : "bg-surface text-ink"
      }`}
    >
      <span className={`eyebrow w-full py-1 ${muted ? "bg-line text-ink" : "bg-ink text-white"}`}>
        {date.toLocaleDateString("en-US", { month: "short" })}
      </span>
      <span className="font-display py-1 text-2xl leading-none">{date.getDate()}</span>
      <span className="pb-1 text-[10px] font-bold uppercase">
        {date.toLocaleDateString("en-US", { weekday: "short" })}
      </span>
    </div>
  );
}
