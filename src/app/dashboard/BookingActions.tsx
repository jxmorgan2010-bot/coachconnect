"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, errorClass } from "@/lib/ui";

export function MarkCompleteButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/bookings/${bookingId}/complete`, { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {error && <p className={errorClass}>{error}</p>}
      <button onClick={onClick} className={primaryButtonClass} disabled={loading}>
        {loading ? "Saving..." : "Mark session complete"}
      </button>
    </div>
  );
}

export function ProgressNoteForm({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [whatWorkedOn, setWhatWorkedOn] = useState("");
  const [nextFocus, setNextFocus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={secondaryButtonClass}>
        Add progress note
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/bookings/${bookingId}/progress-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ whatWorkedOn, nextFocus }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-2 rounded-lg border-2 border-ink bg-muted p-3">
      {error && <p className={errorClass}>{error}</p>}
      <div>
        <label className={labelClass}>What did you work on?</label>
        <textarea className={inputClass} rows={2} value={whatWorkedOn} onChange={(e) => setWhatWorkedOn(e.target.value)} required />
      </div>
      <div>
        <label className={labelClass}>What to focus on next time (optional)</label>
        <textarea className={inputClass} rows={2} value={nextFocus} onChange={(e) => setNextFocus(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <button type="submit" className={primaryButtonClass} disabled={loading}>
          {loading ? "Saving..." : "Save note"}
        </button>
        <button type="button" className={secondaryButtonClass} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
