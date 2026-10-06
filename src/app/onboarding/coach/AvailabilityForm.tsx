"use client";

import { useState } from "react";
import { primaryButtonClass, secondaryButtonClass, errorClass, successClass, labelClass, inputClass, quietLinkClass } from "@/lib/ui";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type Slot = { dayOfWeek: number; startMinute: number; endMinute: number };

function toTimeString(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fromTimeString(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export default function AvailabilityForm({ initial }: { initial: Slot[] }) {
  const [slots, setSlots] = useState<Slot[]>(initial.length ? initial : [{ dayOfWeek: 6, startMinute: 9 * 60, endMinute: 12 * 60 }]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  function updateSlot(i: number, patch: Partial<Slot>) {
    setSlots((s) => s.map((slot, idx) => (idx === i ? { ...slot, ...patch } : slot)));
  }

  function addSlot() {
    setSlots((s) => [...s, { dayOfWeek: 6, startMinute: 9 * 60, endMinute: 12 * 60 }]);
  }

  function removeSlot(i: number) {
    setSlots((s) => s.filter((_, idx) => idx !== i));
  }

  async function onSave() {
    setError(null);
    setSaved(false);
    setLoading(true);
    const res = await fetch("/api/coach/availability", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slots }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert" className={errorClass}>{error}</p>}
      {saved && <p role="status" className={successClass}>Availability saved.</p>}

      <p className="text-sm text-muted-foreground">
        Add the times you usually coach each week. They&apos;re shown on your public profile.
      </p>

      {slots.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-line px-4 py-3 text-sm text-muted-foreground">
          No time slots yet. Add at least one so families can book you.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {slots.map((slot, i) => (
            <li
              key={i}
              className="grid grid-cols-1 items-end gap-3 rounded-lg border-2 border-line bg-chalk p-3 min-[440px]:grid-cols-2 sm:grid-cols-[1.3fr_1fr_1fr_auto]"
            >
              <div className="min-[440px]:col-span-2 sm:col-span-1">
                <label className={labelClass} htmlFor={`slot-${i}-day`}>Day</label>
                <select
                  id={`slot-${i}-day`}
                  className={inputClass}
                  value={slot.dayOfWeek}
                  onChange={(e) => updateSlot(i, { dayOfWeek: Number(e.target.value) })}
                >
                  {DAYS.map((d, idx) => (
                    <option key={d} value={idx}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor={`slot-${i}-start`}>From</label>
                <input
                  id={`slot-${i}-start`}
                  type="time"
                  className={inputClass}
                  value={toTimeString(slot.startMinute)}
                  onChange={(e) => updateSlot(i, { startMinute: fromTimeString(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor={`slot-${i}-end`}>To</label>
                <input
                  id={`slot-${i}-end`}
                  type="time"
                  className={inputClass}
                  value={toTimeString(slot.endMinute)}
                  onChange={(e) => updateSlot(i, { endMinute: fromTimeString(e.target.value) })}
                />
              </div>
              <button
                type="button"
                onClick={() => removeSlot(i)}
                aria-label={`Remove ${DAYS[slot.dayOfWeek]} slot`}
                className={`${quietLinkClass} justify-center px-2 text-danger min-[440px]:col-span-2 sm:col-span-1`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={addSlot} className={secondaryButtonClass}>
          + Add time slot
        </button>
        <button type="button" onClick={onSave} className={primaryButtonClass} disabled={loading || slots.length === 0}>
          {loading ? "Saving..." : "Save availability"}
        </button>
      </div>
    </div>
  );
}
