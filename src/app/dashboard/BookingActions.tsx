"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, errorClass, successClass } from "@/lib/ui";
import { formatCents } from "@/lib/money";

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

export function NoShowButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return <p className={successClass}>We&apos;re on it — your card was never charged, and an admin is reviewing the case.</p>;
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`${secondaryButtonClass} text-danger`}>
        Coach didn&apos;t show
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/bookings/${bookingId}/no-show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ details }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setSubmitted(true);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border-2 border-ink bg-danger/10 p-3">
      {error && <p className={errorClass}>{error}</p>}
      <p className="text-sm font-bold text-ink">Report that the coach didn&apos;t show</p>
      <p className="text-xs text-muted-foreground">
        This cancels the session and voids the payment hold immediately — you won&apos;t be charged. Our team will
        review the case.
      </p>
      <textarea
        className={inputClass}
        rows={2}
        placeholder="Any details? (optional)"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
      />
      <div className="flex gap-2">
        <button type="submit" className={primaryButtonClass} disabled={loading}>
          {loading ? "Submitting..." : "Confirm — coach didn't show"}
        </button>
        <button type="button" className={secondaryButtonClass} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const TIP_PRESETS_CENTS = [300, 500, 1000];

export function TipForm({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customDollars, setCustomDollars] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submittedCents, setSubmittedCents] = useState<number | null>(null);

  if (submittedCents !== null) {
    return <p className={successClass}>Tip of {formatCents(submittedCents)} sent — 100% goes to your coach.</p>;
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={secondaryButtonClass}>
        Add a tip
      </button>
    );
  }

  async function submitTip(tipCents: number) {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/bookings/${bookingId}/tip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipCents }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    setSubmittedCents(tipCents);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border-2 border-ink bg-accent/10 p-3">
      {error && <p className={errorClass}>{error}</p>}
      <p className="text-sm font-bold text-ink">Add a tip for your coach</p>
      <p className="text-xs text-muted-foreground">100% of your tip goes to the coach — no platform fee.</p>
      <div className="flex flex-wrap gap-2">
        {TIP_PRESETS_CENTS.map((cents) => (
          <button key={cents} type="button" disabled={loading} onClick={() => submitTip(cents)} className={secondaryButtonClass}>
            {formatCents(cents)}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          min={1}
          step="0.01"
          placeholder="Custom amount"
          className={inputClass}
          value={customDollars}
          onChange={(e) => setCustomDollars(e.target.value)}
        />
        <button
          type="button"
          disabled={loading || !customDollars}
          className={primaryButtonClass}
          onClick={() => submitTip(Math.round(Number(customDollars) * 100))}
        >
          Send
        </button>
      </div>
      <button type="button" className="self-start text-xs font-bold text-muted-foreground underline" onClick={() => setOpen(false)}>
        No thanks
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
