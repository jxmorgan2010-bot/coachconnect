import { IconCalendar } from "@/components/icons";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toTimeString(minutes: number) {
  const h = minutes / 60;
  const hour12 = Math.floor(h) % 12 === 0 ? 12 : Math.floor(h) % 12;
  const ampm = h >= 12 ? "PM" : "AM";
  const min = minutes % 60;
  return `${hour12}${min ? ":" + String(min).padStart(2, "0") : ""}${ampm}`;
}

type Slot = { id?: string; dayOfWeek: number; startMinute: number; endMinute: number };

/** A coach's weekly hours, one row per day. */
export default function AvailabilityList({ slots, emptyText }: { slots: Slot[]; emptyText: string }) {
  if (slots.length === 0) return <p className="text-muted-foreground">{emptyText}</p>;

  const byDay = DAYS.map((label, day) => ({
    label,
    slots: slots.filter((s) => s.dayOfWeek === day).sort((a, b) => a.startMinute - b.startMinute),
  }));

  return (
    <ul className="divide-y-2 divide-line overflow-hidden rounded-lg border-2 border-ink bg-surface">
      {byDay.map(({ label, slots: daySlots }) => (
        <li key={label} className="flex items-center gap-4 px-4 py-3">
          <span className={`eyebrow w-10 shrink-0 ${daySlots.length ? "text-ink" : "text-muted-foreground"}`}>{label}</span>
          {daySlots.length ? (
            <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-ink">
              {daySlots.map((slot, i) => (
                <span key={slot.id ?? i} className="inline-flex items-center gap-1.5">
                  <IconCalendar className="h-3.5 w-3.5 text-pitch" aria-hidden />
                  {toTimeString(slot.startMinute)}–{toTimeString(slot.endMinute)}
                </span>
              ))}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">Not available</span>
          )}
        </li>
      ))}
    </ul>
  );
}
