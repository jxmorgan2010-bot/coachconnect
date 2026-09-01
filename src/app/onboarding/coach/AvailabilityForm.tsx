"use client";

import { useState } from "react";
import { primaryButtonClass, secondaryButtonClass, errorClass, successClass, labelClass } from "@/lib/ui";

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
      {error && <p className={errorClass}>{error}</p>}
      {saved && <p className={successClass}>Availability saved.</p>}

      <label className={labelClass}>Weekly availability</label>
      <div className="flex flex-col gap-3">
        {slots.map((slot, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
            <select
              className="rounded-lg border border-border px-2 py-1.5 text-sm"
              value={slot.dayOfWeek}
              onChange={(e) => updateSlot(i, { dayOfWeek: Number(e.target.value) })}
            >
              {DAYS.map((d, idx) => (
                <option key={d} value={idx}>{d}</option>
              ))}
            </select>
            <input
              type="time"
              className="rounded-lg border border-border px-2 py-1.5 text-sm"
              value={toTimeString(slot.startMinute)}
              onChange={(e) => updateSlot(i, { startMinute: fromTimeString(e.target.value) })}
            />
            <span className="text-sm text-muted-foreground">to</span>
            <input
              type="time"
              className="rounded-lg border border-border px-2 py-1.5 text-sm"
              value={toTimeString(slot.endMinute)}
              onChange={(e) => updateSlot(i, { endMinute: fromTimeString(e.target.value) })}
            />
            <button type="button" onClick={() => removeSlot(i)} className="ml-auto text-sm font-semibold text-danger">
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
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
